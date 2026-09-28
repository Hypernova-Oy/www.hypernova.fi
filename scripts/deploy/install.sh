#!/usr/bin/env bash
#
# Deploy the Hypernova website on a fresh Debian (or Ubuntu) server, in one command.
#
# The site is server-rendered (Astro `output: 'server'` with the @astrojs/node standalone
# adapter) and Apache proxies the domain to that Node process. This script is the whole
# deployment: packages, the Node.js runtime, the service account, the code, `.env`, the
# build, the systemd unit, the Apache virtual host and (unless told otherwise) a Let's
# Encrypt certificate - and then it checks that the site actually answers.
#
# Usage, on the server, as root:
#   sudo bash scripts/deploy/install.sh                        # the checkout you are in
#   sudo bash scripts/deploy/install.sh --domain hypernova.fi --email ops@hypernova.fi
#   sudo bash scripts/deploy/install.sh --dry-run              # print everything, do nothing
#
# The code comes from the checkout this script is run from, or, with --repo/--branch, from a
# git remote. In the second form the same command on the same server also deploys a new
# version later: it fetches the branch, reinstalls the dependencies, rebuilds and restarts.
# Every step is idempotent, and each one is skipped when it is already in place, so a re-run
# is quick.
#
# With --auto-update the server also follows that branch on its own: a cron job runs this same
# script every few minutes with --if-changed, which stops immediately when the branch has not
# moved. A run that pulls a revision which does not build, or does not pass the checks, puts
# back the revision that was live before it, so an unattended deploy cannot leave a broken
# build answering the domain.
#
# The layout follows the facts of this project (see "Deployment" in README.md):
#   * `.env` is read while `npm run build` runs, so the Redmine settings and
#     FORM_TOKEN_SECRET are baked into the server bundle. The file therefore has to exist
#     before the build, the site has to be rebuilt after it changes, and the built bundle
#     holds the Redmine API key - which is why the app directory is only readable by the
#     service account.
#   * The unit sets PORT, because /search-index.json reads the pages of the site back from
#     `http://127.0.0.1:$PORT` (src/pages/search-index.json.ts, `selfOrigin`).
#   * Apache preserves the Host header: the forms compare `Astro.url.host` with the Origin
#     header, and take the client address from the last X-Forwarded-For hop that mod_proxy
#     appends.
#   * With --behind-proxy a proxy that ends TLS sits in front of this host. The host then
#     serves plain HTTP - no certificate is requested and Apache does not listen on 443 - and
#     Apache stops appending its own X-Forwarded-For hop: the rate limit reads the last hop,
#     and Apache's hop would be the proxy's address for every visitor.
#   * The unit is called `hypernova` by default, because scripts/refresh-search-index.sh
#     restarts that name unless it is told otherwise.
#
# Exit status: 0 = the site is deployed and answering, 1 = it is not (or the arguments or
# the environment are wrong).
#
# errtrace (the -E) matters here: an automatic deploy arms a handler for a failed step in one
# function, and that handler has to fire for a failure inside another one - the build, or the
# checks that follow it - which it does not do without -E.
set -Eeuo pipefail

# --- what is deployed where; every value can also come from the environment -----------
DOMAIN="${HYPERNOVA_DOMAIN:-www.hypernova.fi}"   # public hostname (ServerName)
PORT="${HYPERNOVA_PORT:-4321}"                    # loopback port of the Node process
HOST="${HYPERNOVA_HOST:-127.0.0.1}"               # address the Node process binds to
SERVICE="${HYPERNOVA_SERVICE:-hypernova}"         # systemd unit, e.g. `systemctl status`
APP_USER="${HYPERNOVA_USER:-hypernova}"           # service account
APP_HOME="${HYPERNOVA_HOME:-/opt/hypernova}"      # its home directory (npm cache)
APP_DIR="${HYPERNOVA_DIR:-/opt/hypernova/app}"    # where the checkout lives
BRANCH="${HYPERNOVA_BRANCH:-}"                    # default: the branch of this checkout
REPO="${HYPERNOVA_REPO:-}"                        # default: origin of this checkout
SOURCE="${HYPERNOVA_SOURCE:-}"                    # deploy a working tree with rsync instead
ENV_FILE="${HYPERNOVA_ENV_FILE:-}"                # seed .env from this file
EMAIL="${HYPERNOVA_EMAIL:-}"                      # Let's Encrypt account for expiry warnings
WITH_PACKAGES="${HYPERNOVA_PACKAGES:-1}"
WITH_APACHE="${HYPERNOVA_APACHE:-1}"
WITH_TLS="${HYPERNOVA_TLS:-1}"
WITH_PROXY="${HYPERNOVA_BEHIND_PROXY:-0}"  # a proxy that ends TLS sits in front of this host
WITH_AUTO_UPDATE="${HYPERNOVA_AUTO_UPDATE:-0}"  # a cron job that follows the branch
AUTO_UPDATE_EVERY="${HYPERNOVA_AUTO_UPDATE_EVERY:-5}"  # minutes between those runs
IF_CHANGED="${HYPERNOVA_IF_CHANGED:-0}"  # stop right away when the branch has not moved
DRY_RUN="${HYPERNOVA_DRY_RUN:-0}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CHECKOUT_DIR="$(dirname -- "$(dirname -- "$SCRIPT_DIR")")"

# Node.js version package.json asks for (engines.node, ">=22.12.0").
REQUIRED_NODE="$(sed -n 's/.*"node" *: *">=\([0-9][0-9.]*\)".*/\1/p' "$CHECKOUT_DIR/package.json" 2>/dev/null | head -1)"
REQUIRED_NODE="${REQUIRED_NODE:-22.12.0}"

# Set while running, reported at the end.
REDMINE_NOT_CONFIGURED=0

# The revision an automated run found in --dir, kept so that a pull that turns out badly can
# be undone (see auto_update_rollback). That function runs at most once per run.
PREVIOUS_REVISION=""
ROLLBACK_DONE=0

# What the git flow settled on, so that the cron job below can name the remote and the branch
# itself instead of hoping the deployed checkout still answers those questions.
RESOLVED_REPO=""
RESOLVED_BRANCH=""

# The cron job that follows the branch, and the journal tag it logs under.
CRON_NAME=""
CRON_LOG_TAG=""
CRON_INTERVAL_TEXT=""

# The Node.js that the unit starts and that the build runs with. ensure_node() replaces it
# with the Node.js that is actually installed.
NODE_BIN=/usr/bin/node

info() { printf '==> %s\n' "$*"; }
warn() { printf '!!! %s\n' "$*" >&2; }

# A failure in an automated run has to hand the domain back to a revision that works, so such
# a run undoes its pull before it exits: no one is watching that run.
fail() {
  printf '!!! %s\n' "$*" >&2
  if [ "$IF_CHANGED" -eq 1 ] && [ -n "$PREVIOUS_REVISION" ]; then
    auto_update_rollback
  fi
  exit 1
}

# Runs a command, or prints it in a dry run.
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  + %s\n' "$*"
    return 0
  fi
  "$@"
}

# Runs a shell snippet, for the few steps that use a pipe or a redirection.
run_shell() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  + %s\n' "$1"
    return 0
  fi
  bash -c "$1"
}

# Writes a configuration file with a mode and an owner; content on stdin. Returns 1 when
# the file already had exactly this content, so the caller can skip a reload.
write_config() {
  local mode="$1" owner="$2" target="$3" content temporary

  content="$(cat)"

  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  + write %s (mode %s, owner %s), %s lines\n' \
      "$target" "$mode" "$owner" "$(printf '%s\n' "$content" | wc -l)"
    printf '%s\n' "$content" | sed 's/^/      | /'
    return 0
  fi

  temporary="$(mktemp)"
  printf '%s\n' "$content" > "$temporary"

  if [ -f "$target" ] && cmp -s "$temporary" "$target"; then
    rm -f "$temporary"
    return 1
  fi

  install -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$temporary" "$target"
  rm -f "$temporary"
  info "wrote $target"
  return 0
}

# Runs a shell snippet as the service account, in the application directory. Keep snippets
# free of single quotes. `npm ci` must not run with NODE_ENV=production: npm would then
# leave out the dev dependencies that `astro build` needs.
#
# HYPERNOVA_SITE_URL is read while `astro build` runs and becomes the build's `site`: the
# canonical links, the sitemap and the redirect of the other name then point at the domain this
# deployment serves instead of at production, over the scheme site_scheme() decides (see the
# canonical hostname below: https wherever a browser reaches this host over TLS, http on a host
# that serves plain HTTP). HYPERNOVA_ALLOWED_HOSTS is the host list the dev and preview servers
# accept, so a deployment developed on another name works too (see the comments in
# astro.config.mjs).
app_run() {
  local snippet="$1"
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  + [%s in %s] %s\n' "$APP_USER" "$APP_DIR" "$snippet"
    return 0
  fi
  runuser -u "$APP_USER" -- env HOME="$APP_HOME" PATH="${NODE_BIN%/node}:$PATH" \
    HYPERNOVA_SITE_URL="$(site_scheme)://$DOMAIN" \
    HYPERNOVA_ALLOWED_HOSTS="$DOMAIN,$DOMAIN_ALIAS" \
    bash -c "cd '$APP_DIR' && $snippet"
}

# True when the first dotted version is the same or newer than the second.
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

# Waits for a URL to answer anything below 500.
wait_for_http() {
  local url="$1" seconds="${2:-30}"
  local deadline=$((SECONDS + seconds))

  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

usage() {
  cat <<'USAGE'
Deploy the Hypernova website on this server (Debian or Ubuntu, systemd, root).

Usage: sudo bash scripts/deploy/install.sh [options]

  -d, --domain DOMAIN   Public hostname (default: www.hypernova.fi): the canonical address
                        of the site, what its certificate and its canonical links name. The
                        other name (the same with www, or without it) redirects here.
  -p, --port PORT       Loopback port of the Node process (default: 4321)
      --host ADDRESS    Address the Node process binds to (default: 127.0.0.1)
  -s, --service NAME    systemd unit name (default: hypernova)
  -u, --user NAME       Service account (default: hypernova)
      --dir PATH        Where the checkout is installed (default: /opt/hypernova/app)
  -b, --branch NAME     Branch of --repo to deploy (default: the branch of the checkout)
  -r, --repo URL        Git remote to clone, and on later runs update, from
      --source PATH     Tree to copy to --dir (default: the checkout this script is in)
  -e, --env-file PATH   Seed .env from this file instead of generating one
  -m, --email ADDRESS   Let's Encrypt account, for certificate expiry warnings
      --no-packages     Assume every package is already installed
      --no-apache       Do not touch Apache (something else proxies the domain)
      --no-tls          Do not request a certificate, serve plain HTTP
      --behind-proxy    A proxy that ends TLS sits in front of this host: serve plain HTTP
                        (no certificate, no listener on 443) and keep that proxy's
                        X-Forwarded-For chain
      --auto-update     Let the server follow --branch by itself: a cron job repeats this
                        script every few minutes and deploys the commits it finds
      --auto-update-every MINUTES
                        How often that job runs (default: 5; 1-59)
      --no-auto-update  Remove the job an earlier run installed
      --if-changed      What that job passes: stop right away when --branch has not moved
      --dry-run         Print every change instead of making it
  -h, --help            Show this help

The default is to copy the checkout this script lives in into --dir. With --repo or
--branch the code is cloned from that git remote instead, and a later run of the same
command updates it - that needs the branch to exist on the remote. --auto-update builds
on that flow, because the job has to know what the remote holds.

Environment: HYPERNOVA_DOMAIN, HYPERNOVA_PORT, HYPERNOVA_HOST, HYPERNOVA_SERVICE,
HYPERNOVA_USER, HYPERNOVA_HOME, HYPERNOVA_DIR, HYPERNOVA_BRANCH, HYPERNOVA_REPO,
HYPERNOVA_SOURCE, HYPERNOVA_ENV_FILE, HYPERNOVA_EMAIL, HYPERNOVA_PACKAGES,
HYPERNOVA_APACHE, HYPERNOVA_TLS, HYPERNOVA_BEHIND_PROXY, HYPERNOVA_AUTO_UPDATE,
HYPERNOVA_AUTO_UPDATE_EVERY, HYPERNOVA_IF_CHANGED, HYPERNOVA_DRY_RUN.
USAGE
}

# Kept for the hint at the end of the run, and reused as the command line of the cron job, so
# that an automatic deploy is the same deploy as a manual one. Repeating the command has to
# reproduce this deployment, and the mode flags are part of it (--behind-proxy decides how the
# virtual host is rendered, --no-apache whether Apache is touched at all). One-shot flags are
# left out, so a rehearsed run does not suggest rehearsing the next deploy too, and
# --if-changed stays out because the job adds it itself. Flags only: settings that came from
# HYPERNOVA_* variables are not part of the command line.
RERUN_ARGS=()
for argument in "$@"; do
  case "$argument" in
    --dry-run | --if-changed) continue ;;
  esac
  RERUN_ARGS+=("$argument")
done

while [ $# -gt 0 ]; do
  case "$1" in
    -d|--domain) DOMAIN="${2:?--domain needs a value}"; shift 2 ;;
    -p|--port) PORT="${2:?--port needs a value}"; shift 2 ;;
    --host) HOST="${2:?--host needs a value}"; shift 2 ;;
    -s|--service) SERVICE="${2:?--service needs a value}"; shift 2 ;;
    -u|--user) APP_USER="${2:?--user needs a value}"; shift 2 ;;
    --dir) APP_DIR="${2:?--dir needs a value}"; shift 2 ;;
    -b|--branch) BRANCH="${2:?--branch needs a value}"; shift 2 ;;
    -r|--repo) REPO="${2:?--repo needs a value}"; shift 2 ;;
    --source) SOURCE="${2:?--source needs a value}"; shift 2 ;;
    -e|--env-file) ENV_FILE="${2:?--env-file needs a value}"; shift 2 ;;
    -m|--email) EMAIL="${2:?--email needs a value}"; shift 2 ;;
    --no-packages) WITH_PACKAGES=0; shift ;;
    --no-apache) WITH_APACHE=0; shift ;;
    --no-tls) WITH_TLS=0; shift ;;
    --behind-proxy) WITH_PROXY=1; shift ;;
    --auto-update) WITH_AUTO_UPDATE=1; shift ;;
    --auto-update-every) AUTO_UPDATE_EVERY="${2:?--auto-update-every needs a value}"; shift 2 ;;
    --no-auto-update) WITH_AUTO_UPDATE=0; shift ;;
    --if-changed) IF_CHANGED=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "Unknown option: $1" ;;
  esac
done

# A proxy in front ends TLS for the visitors, so this host serves plain HTTP: certbot would
# have to solve its challenge through that proxy, and a certificate here would only encrypt
# the hop between the two hosts.
if [ "$WITH_PROXY" -eq 1 ]; then
  WITH_TLS=0
fi

# The automatic deploy watches a branch, so --auto-update needs the git flow: without
# --repo/--branch it follows the branch of the checkout it was started from, and the remote
# that checkout came from. --if-changed, which the job passes, only means anything there.
if [ "$WITH_AUTO_UPDATE" -eq 1 ] && [ -z "$REPO" ] && [ -z "$BRANCH" ]; then
  BRANCH="$(git -C "$CHECKOUT_DIR" branch --show-current 2>/dev/null || true)"
  [ -n "$BRANCH" ] \
    || fail "--auto-update follows a branch, so it needs --repo/--branch (this is not a checkout)."
  info "no --branch given; the automatic deploy will follow $BRANCH"
fi
if [ "$IF_CHANGED" -eq 1 ] && [ -z "$REPO" ] && [ -z "$BRANCH" ]; then
  fail "--if-changed asks a git remote what it holds, so it needs --repo/--branch."
fi

if [ "$WITH_AUTO_UPDATE" -eq 1 ]; then
  case "$AUTO_UPDATE_EVERY" in
    '' | *[!0-9]*) fail "--auto-update-every has to be a number of minutes, got \"$AUTO_UPDATE_EVERY\"" ;;
  esac
  { [ "$AUTO_UPDATE_EVERY" -ge 1 ] && [ "$AUTO_UPDATE_EVERY" -le 59 ]; } \
    || fail "--auto-update-every has to be between 1 and 59, got $AUTO_UPDATE_EVERY"
  if [ "$((60 % 10#$AUTO_UPDATE_EVERY))" -ne 0 ]; then
    warn "--auto-update-every $AUTO_UPDATE_EVERY does not divide an hour, so the job does not"
    warn "start evenly spaced (cron reads */$AUTO_UPDATE_EVERY)."
  fi

  CRON_INTERVAL_TEXT="every $AUTO_UPDATE_EVERY minutes"
  if [ "$AUTO_UPDATE_EVERY" -eq 1 ]; then
    CRON_INTERVAL_TEXT="every minute"
  fi
fi

# A unit name may hold a dot, and cron ignores a file in /etc/cron.d that does. These two are
# worked out whatever the run was asked for: a run that is told to remove the job
# (--no-auto-update) has to name the same file that the run which installed it wrote.
CRON_NAME="${SERVICE//[!a-zA-Z0-9_-]/-}-auto-update"
CRON_LOG_TAG="$SERVICE-auto-update"

# --- sanity, before anything is changed ------------------------------------------------
[ -f "$CHECKOUT_DIR/package.json" ] \
  || fail "No package.json in $CHECKOUT_DIR - run this script from the repository checkout."

if [ "$(id -u)" -ne 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  fail "This script installs packages and services, so it has to run as root: sudo bash $0"
fi

if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-} ${ID_LIKE:-}" in
    *debian*|*ubuntu*) ;;
    *) fail "${PRETTY_NAME:-This system} is not Debian or Ubuntu; the script installs Debian packages." ;;
  esac
else
  warn "No /etc/os-release; assuming Debian-style packages."
fi

[ -d /run/systemd/system ] \
  || fail "systemd is not running here; this script installs a systemd service."

case "$PORT" in
  ''|*[!0-9]*) fail "--port has to be a number, got \"$PORT\"" ;;
esac
{ [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; } || fail "--port has to be between 1 and 65535, got $PORT"

case "$APP_USER" in
  ''|*[!a-zA-Z0-9_.-]*) fail "--user has to be a plain account name, got \"$APP_USER\"" ;;
esac
case "$SERVICE" in
  ''|*[!a-zA-Z0-9_.@-]*) fail "--service has to be a plain unit name, got \"$SERVICE\"" ;;
esac
case "$APP_DIR" in
  /*) ;;
  *) fail "--dir has to be an absolute path, got \"$APP_DIR\"" ;;
esac
case "$DOMAIN" in
  ''|*[!a-zA-Z0-9.-]*) fail "--domain has to be a hostname, got \"$DOMAIN\"" ;;
esac
if [ -n "$SOURCE" ] && [ ! -d "$SOURCE" ]; then
  fail "--source $SOURCE is not a directory"
fi
if [ -n "$ENV_FILE" ] && [ ! -f "$ENV_FILE" ]; then
  fail "--env-file $ENV_FILE is not a file"
fi

# The second name the site answers on: www.hypernova.fi and hypernova.fi.
case "$DOMAIN" in
  www.*) DOMAIN_ALIAS="${DOMAIN#www.}" ;;
  *) DOMAIN_ALIAS="www.$DOMAIN" ;;
esac

if [ "$DRY_RUN" -eq 1 ]; then
  info "Dry run: nothing below is executed, every change is only printed."
fi
info "Deploying to $APP_DIR as $APP_USER, serving $DOMAIN ($HOST:$PORT) as unit $SERVICE."

# --- 1/11 packages ---------------------------------------------------------------------
install_packages() {
  info "[1/11] System packages"

  if [ "$WITH_PACKAGES" -eq 0 ]; then
    info "--no-packages: assuming every package is already installed."
    return 0
  fi

  local wanted=(ca-certificates curl git gnupg rsync) package
  [ "$WITH_APACHE" -eq 1 ] && wanted+=(apache2)
  [ "$WITH_TLS" -eq 1 ] && wanted+=(certbot python3-certbot-apache)
  # The daemon that reads /etc/cron.d, where the automatic deploy puts its job.
  [ "$WITH_AUTO_UPDATE" -eq 1 ] && wanted+=(cron)

  # sharp ships prebuilt binaries for these architectures; anywhere else it is compiled
  # while `npm ci` runs.
  case "$(uname -m)" in
    x86_64 | aarch64) ;;
    *) wanted+=(build-essential python3) ;;
  esac

  local missing=()
  for package in "${wanted[@]}"; do
    dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed' \
      || missing+=("$package")
  done

  if [ "${#missing[@]}" -eq 0 ]; then
    info "already installed: ${wanted[*]}"
    return 0
  fi

  info "installing: ${missing[*]}"
  run env DEBIAN_FRONTEND=noninteractive apt-get update
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"
}

# --- 2/11 Node.js ----------------------------------------------------------------------
# The unit starts one absolute binary, so Node.js has to live outside a user's shell setup:
# an nvm install under a home directory does not work for a service (and ProtectHome=yes
# below blocks it anyway). A distribution Node.js is accepted when it is new enough.
ensure_node() {
  info "[2/11] Node.js $REQUIRED_NODE or newer"

  local candidate
  for candidate in /usr/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done

  if [ -x "$NODE_BIN" ]; then
    local current
    current="$("$NODE_BIN" -v | sed 's/^v//')"
    if version_ge "$current" "$REQUIRED_NODE"; then
      info "$NODE_BIN has node $current"
      return 0
    fi
    info "$NODE_BIN has node $current, which is too old"
  else
    info "no node in /usr/bin or /usr/local/bin (a shell-managed node cannot run the service)"
  fi

  if [ "$WITH_PACKAGES" -eq 0 ]; then
    fail "Node.js $REQUIRED_NODE is needed in /usr/bin and --no-packages was given."
  fi

  local major="${REQUIRED_NODE%%.*}"
  info "installing Node.js $major.x from NodeSource"
  run_shell "curl -fsSL https://deb.nodesource.com/setup_${major}.x -o /var/tmp/nodesource_setup.sh && bash /var/tmp/nodesource_setup.sh"
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  hash -r

  if [ "$DRY_RUN" -eq 0 ]; then
    NODE_BIN=/usr/bin/node
    [ -x "$NODE_BIN" ] || fail "The NodeSource package did not install $NODE_BIN."
    local installed
    installed="$("$NODE_BIN" -v | sed 's/^v//')"
    version_ge "$installed" "$REQUIRED_NODE" \
      || fail "$NODE_BIN has node $installed, which is older than $REQUIRED_NODE."
    info "$NODE_BIN has node $installed"
  fi
}

# --- 3/11 service account --------------------------------------------------------------
ensure_account() {
  info "[3/11] Service account and directories"

  # 750: the built bundle carries the Redmine API key, so only the service account may read
  # the application directory. .env is 600 inside it. The directories are created before the
  # account, so that adduser finds its home directory.
  run install -d -m 750 "$APP_HOME" "$APP_DIR"

  if getent passwd "$APP_USER" >/dev/null; then
    info "user $APP_USER exists"
  else
    run adduser --system --group --no-create-home --home "$APP_HOME" \
      --shell /usr/sbin/nologin "$APP_USER"
  fi

  run install -d -m 750 -o "$APP_USER" -g "$APP_USER" "$APP_HOME"
  run install -d -m 750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
}

# The built bundle carries the Redmine settings, so the application directory is kept
# private to the service account. rsync copies the mode of the source directory, and the
# build writes new files with the default umask, so this runs after both.
protect_app_dir() {
  run chmod -R go-rwx "$APP_DIR"
}

# --- 4/11 application code --------------------------------------------------------------
# Two ways to get the code into place:
#   * copy the checkout this script was run from (the default, and the only way that works
#     before the branch has been pushed anywhere);
#   * --repo/--branch clone from, and later update from, a git remote, so that re-running
#     the script on the server deploys a new version on its own.
sync_code() {
  info "[4/11] Application code"

  if [ -n "$REPO" ] || [ -n "$BRANCH" ]; then
    sync_code_from_git
  else
    sync_code_from_checkout
  fi

  # The build writes dist/ and .astro/ as this account.
  run chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
  protect_app_dir
}

sync_code_from_checkout() {
  local source="${SOURCE:-$CHECKOUT_DIR}"

  if [ "$(readlink -f "$source")" = "$(readlink -f "$APP_DIR")" ]; then
    info "$APP_DIR already holds this checkout; rebuilding it"
    return 0
  fi

  if ! command -v rsync >/dev/null; then
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '  + rsync is installed in step 1, then the copy below runs\n'
    else
      fail "rsync is needed to copy $source; install it or deploy with --repo/--branch."
    fi
  fi

  info "copying $source to $APP_DIR (git, node_modules, dist and .env stay behind)"
  run rsync -a --delete \
    --exclude .git --exclude node_modules --exclude dist --exclude .astro --exclude .env \
    "$source"/ "$APP_DIR"/
}

sync_code_from_git() {
  local repo="$REPO" branch="$BRANCH"

  if [ -z "$repo" ] && [ -d "$CHECKOUT_DIR/.git" ]; then
    repo="$(git -C "$CHECKOUT_DIR" remote get-url origin 2>/dev/null || true)"
  fi
  [ -z "$repo" ] && repo="https://github.com/Hypernova-Oy/www.hypernova.fi.git"
  # git@github.com:owner/repo.git -> https://github.com/owner/repo.git, because a fresh
  # server has no deploy key. Pass a git@ URL to --repo once one exists.
  repo="$(printf '%s' "$repo" | sed 's|^git@\([^:]*\):|https://\1/|')"

  if [ -z "$branch" ]; then
    if [ -d "$APP_DIR/.git" ]; then
      branch="$(git -C "$APP_DIR" branch --show-current 2>/dev/null || true)"
    elif [ -d "$CHECKOUT_DIR/.git" ]; then
      branch="$(git -C "$CHECKOUT_DIR" branch --show-current 2>/dev/null || true)"
    fi
    branch="${branch:-master}"
    info "no --branch given; using $branch"
  fi

  RESOLVED_REPO="$repo"
  RESOLVED_BRANCH="$branch"

  # The job is described as watching --repo, and it fetches through the origin of the
  # checkout in --dir: worth a word when those are not the same place, because then the
  # branch that gets deployed is the one that checkout follows, not the one that was named.
  # The later messages name the remote that is really asked, so they stay true either way.
  local fetch_from="$repo"
  if [ "$DRY_RUN" -eq 0 ] && [ -d "$APP_DIR/.git" ]; then
    local deployed_origin
    deployed_origin="$(app_run 'git remote get-url origin' 2>/dev/null || true)"
    deployed_origin="$(printf '%s' "$deployed_origin" | sed 's|^git@\([^:]*\):|https://\1/|')"
    if [ -n "$deployed_origin" ] && [ "$deployed_origin" != "$repo" ]; then
      warn "$APP_DIR fetches from $deployed_origin, not from $repo: it keeps its own origin."
      fetch_from="$deployed_origin"
    fi
  fi

  # --if-changed is how the cron job starts: ask the remote whether the branch moved, and stop
  # without touching anything when it did not. A quiet run every few minutes, and work only
  # when there is something to deploy.
  if [ "$IF_CHANGED" -eq 1 ] && [ -d "$APP_DIR/.git" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '  + stop here unless origin/%s holds a revision other than the one in %s\n' \
        "$branch" "$APP_DIR"
    else
      local deployed remote
      # A remote that cannot be reached is not "nothing to deploy": say so, change nothing,
      # and let the next run of the job try again.
      if ! app_run 'git fetch --prune origin'; then
        warn "Could not reach $fetch_from for $branch; $APP_DIR was left as it is."
        exit 1
      fi
      deployed="$(app_run 'git rev-parse HEAD')"
      if ! remote="$(app_run "git rev-parse origin/$branch")"; then
        warn "$fetch_from has no branch $branch any more; $APP_DIR was left as it is."
        exit 1
      fi
      if [ "$deployed" = "$remote" ]; then
        info "origin/$branch is still at ${remote:0:12}; nothing to deploy."
        exit 0
      fi
      info "origin/$branch moved to ${remote:0:12}, deployed was ${deployed:0:12}"
    fi
  fi

  if [ -d "$APP_DIR/.git" ]; then
    if [ "$IF_CHANGED" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
      # What is live now, for auto_update_rollback. From here on this run has changed the
      # code on disk, so every later failure has to undo that: the trap is set for an
      # automated run only, where no one is watching it happen.
      PREVIOUS_REVISION="$(app_run 'git rev-parse HEAD')"
      trap 'auto_update_rollback' ERR
    fi
    info "updating $APP_DIR from origin/$branch"
    # As the service account: the checkout belongs to it, and root's git refuses a
    # repository that another user owns ("dubious ownership").
    app_run 'git fetch --prune origin'
    app_run "git reset --hard origin/$branch"
    # Removes files the branch no longer has; node_modules, dist and .env are ignored by git.
    app_run 'git clean -fd'
    return 0
  fi

  if [ "$DRY_RUN" -eq 0 ]; then
    # git ls-remote exits 2 when the remote has no such branch, and anything else when the
    # remote itself is unreachable (permissions, network) - only the first is a mistake in
    # the arguments.
    local status=0
    git ls-remote --exit-code --heads "$repo" "$branch" >/dev/null 2>&1 || status=$?
    if [ "$status" -eq 2 ]; then
      fail "$repo has no branch $branch: push it first, or deploy this checkout (the default)."
    elif [ "$status" -ne 0 ]; then
      warn "Could not ask $repo about branch $branch (git said $status); trying to clone anyway."
    fi
  fi

  # --dir may already hold a deployment that was copied there (the checkout flow above): git
  # refuses to clone into a directory that is not empty, so that directory becomes a checkout
  # of the branch instead. `.env`, node_modules and the build are ignored by git and stay.
  # app_run() prints these instead of running them in a dry run.
  if [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    info "$APP_DIR holds no checkout; making it one (keeps .env, node_modules and the build)"
    app_run "git init --quiet --initial-branch='$branch'"
    app_run "git remote add origin '$repo' 2>/dev/null || git remote set-url origin '$repo'"
    app_run 'git fetch --prune origin'
    app_run "git reset --hard origin/$branch"
    app_run 'git clean -fd'
    return 0
  fi

  info "cloning $repo (branch $branch) into $APP_DIR"
  run git clone --branch "$branch" "$repo" "$APP_DIR"
}

# --- 5/11 environment -------------------------------------------------------------------
ensure_env_file() {
  info "[5/11] Environment file"

  local template="$APP_DIR/.env.example" secret

  if [ -n "$ENV_FILE" ]; then
    info "installing $ENV_FILE as $APP_DIR/.env"
    [ "$DRY_RUN" -eq 1 ] || install -m 600 -o "$APP_USER" -g "$APP_USER" "$ENV_FILE" "$APP_DIR/.env"
  elif [ -f "$APP_DIR/.env" ]; then
    info "keeping the existing $APP_DIR/.env"
  else
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '  + create %s from %s with a fresh FORM_TOKEN_SECRET (mode 600, owner %s)\n' \
        "$APP_DIR/.env" "$template" "$APP_USER"
    else
      [ -f "$template" ] || fail "$template is missing; the checkout carries it."
      secret="$(openssl rand -hex 32)"
      info "creating $APP_DIR/.env with a fresh FORM_TOKEN_SECRET"
      sed "s|^FORM_TOKEN_SECRET=.*|FORM_TOKEN_SECRET=\"$secret\"|" "$template" > "$APP_DIR/.env"
      chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
      chmod 600 "$APP_DIR/.env"
    fi
  fi

  if [ "$DRY_RUN" -eq 0 ] && grep -q '^REDMINE_NEW_QUOTE_API_KEY=""' "$APP_DIR/.env"; then
    REDMINE_NOT_CONFIGURED=1
  fi
}

# --- 6/11 build -------------------------------------------------------------------------
build_app() {
  info "[6/11] Dependencies and production build"

  app_run 'npm ci --no-audit --no-fund'
  app_run 'npm run build'

  if [ "$DRY_RUN" -eq 0 ] && [ ! -f "$APP_DIR/dist/server/entry.mjs" ]; then
    fail "The build wrote no $APP_DIR/dist/server/entry.mjs."
  fi
  protect_app_dir
  info "bundle built into $APP_DIR/dist"
}

# --- 7/11 systemd unit ------------------------------------------------------------------
render_unit() {
  cat <<UNIT
[Unit]
Description=Hypernova website (Astro SSR)
Documentation=https://github.com/Hypernova-Oy/www.hypernova.fi
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
# The Redmine settings and FORM_TOKEN_SECRET are baked into the bundle while it is built;
# the file is read here as well, so a variable that has to be read at runtime keeps
# working without another change to this unit. The leading dash makes a missing file
# harmless.
EnvironmentFile=-$APP_DIR/.env
Environment=NODE_ENV=production
Environment=HOST=$HOST
# PORT is not only the listening port: /search-index.json reads the pages of the site back
# from http://127.0.0.1:\$PORT, so it has to stay in step with ProxyPass below.
Environment=PORT=$PORT
ExecStart=$NODE_BIN ./dist/server/entry.mjs
Restart=always
RestartSec=2
TimeoutStopSec=20
SyslogIdentifier=$SERVICE
StandardOutput=journal
StandardError=journal

# Hardening. The process reads its own bundle, answers HTTP on the loopback address and
# talks to Redmine. MemoryDenyWriteExecute is left out on purpose (V8 writes and executes
# its own JIT pages) and so are SystemCallFilter and PrivateNetwork - the latter would cut
# off the loopback self-fetch described above.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
CapabilityBoundingSet=
AmbientCapabilities=
UMask=0027

[Install]
WantedBy=multi-user.target
UNIT
}

install_unit() {
  info "[7/11] systemd unit $SERVICE.service"

  local unit="/etc/systemd/system/$SERVICE.service" temporary
  temporary="$(mktemp --suffix=.service)"
  render_unit > "$temporary"

  if [ "$DRY_RUN" -eq 0 ]; then
    systemd-analyze verify "$temporary" \
      || fail "systemd-analyze rejected the generated unit; nothing was installed."
  fi

  if write_config 644 root:root "$unit" < "$temporary"; then
    run systemctl daemon-reload
  else
    info "$unit is already up to date"
  fi
  rm -f "$temporary"

  run systemctl enable "$SERVICE"
  # Starts the service on a first run and picks up the new build on every later one.
  run systemctl restart "$SERVICE"
}

# --- 8/11 Apache ------------------------------------------------------------------------
# The virtual host that serves $DOMAIN. With --behind-proxy it keeps what the proxy in front
# sent; without one, mod_proxy has to add the client address itself, because Apache is then
# the process that sees the visitor.
# --- Apache output compression -----------------------------------------------------------
# The vhosts below add this block. gzip already covers these types - Debian's
# mods-enabled/deflate.conf adds it - and Brotli is smaller on them and covers
# application/json, which that file does not: on this site `/` is 12752 bytes against gzip's
# 13417, and /search-index.json is 9340 against 29467. The already-compressed formats
# (woff2, png, webp, avif) are left alone and are not listed here.
#
# Both filters are registered for the same types, and mod_deflate's runs first, so a browser
# that offers `br, gzip` - all of them do - would be answered with gzip and the Brotli filter
# would never be used. `no-gzip` takes mod_deflate out of the request for the clients that
# can read Brotli, and only for those: a client that does not offer `br` still gets gzip, and
# one that offers neither still gets the response uncompressed.
#
# The filter is only added where mod_brotli is loaded, which is why configure_apache()
# enables the module when the host has it instead of making a host without it fail to start.
compression_directives() {
  cat <<'COMPRESSION'
  <IfModule mod_brotli.c>
    AddOutputFilterByType BROTLI_COMPRESS text/html text/plain text/css text/xml application/xml application/javascript application/json image/svg+xml
    SetEnvIfExpr "%{HTTP:Accept-Encoding} =~ /(^|[ ,])br([ ,;]|$)/" no-gzip
  </IfModule>
COMPRESSION
}

# --- Apache response caching -------------------------------------------------------------
# The Node entry answers every file under /_astro/ with `Cache-Control: public, max-age=0`
# and a weak ETag - the static handler's default - so the browser asks again on every
# navigation, even for a file it already has. The bytes do not come back (the answer is a
# 304), but the round trip is still on the critical path: the render-blocking stylesheet
# (97 KB, BaseLayout.C6frLDtG.css) has to be confirmed before the page can paint, and the
# preloaded fonts (48 KB Inter, 24 KB OCR-A before the subset) have to be confirmed before
# the wordmark - the largest contentful paint on `/` - can be drawn.
#
# Everything Astro writes into /_astro/ carries a content hash in its name
# (`BaseLayout.C6frLDtG.css`, `fonts/09d8b6046e3eab84.woff2`), so one URL can only ever mean
# one set of bytes and a year is safe: a rebuild emits new names rather than new bytes under
# an old name. The files in public/ keep their names from build to build, so they get an
# hour instead - long enough to take the revalidation off the common repeat visit (the
# favicons are asked for on every document load), short enough that a redesigned icon is not
# stuck in a browser for a year.
caching_directives() {
  cat <<'CACHING'
  <IfModule mod_headers.c>
    <LocationMatch "^/_astro/">
      Header unset Cache-Control
      Header set Cache-Control "public, max-age=31536000, immutable"
    </LocationMatch>

    <LocationMatch "^/(favicon[^/]*\.(ico|png|svg)|og-image\.png|authors/[^/]+)$">
      Header unset Cache-Control
      Header set Cache-Control "public, max-age=3600"
    </LocationMatch>
  </IfModule>
CACHING
}

# --- Security headers ---------------------------------------------------------------------
# The headers the Node entry does not send, so every response to a browser carries them
# whether or not a proxy is in front. HSTS is the one the proxy case needs most: the connection
# a browser sees is HTTPS even when the hop to this host is the plain one, and a browser ignores
# the header when it arrives over plain HTTP - so sending it from the HTTP vhost is safe and is
# what pins the domain. COOP cuts the browsing-context link to another origin's window, which
# nothing here uses (no popups, no cross-origin frames), and X-Frame-Options is the older half
# of the policy's `frame-ancestors 'none'` (astro.config.mjs) that browsers without CSP obey.
# `always` puts them on error responses too, where X-Content-Type-Options matters most.
security_directives() {
  cat <<'SECURITY'
  <IfModule mod_headers.c>
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    Header always set Cross-Origin-Opener-Policy "same-origin"
    Header always set X-Frame-Options "DENY"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
  </IfModule>
SECURITY
}

# --- The canonical hostname ---------------------------------------------------------------
# The site answers on two names - DOMAIN and DOMAIN_ALIAS, `www.hypernova.fi` and
# `hypernova.fi` - and the certificate below covers both, but only one of them is the address of
# the deployment: `--domain`, which reaches the build as HYPERNOVA_SITE_URL and becomes the
# `site` of astro.config.mjs (see app_run below), and which is the name the redirect below and
# the app's own half of it name (src/utils/canonical-host.ts). What is left is to send the other
# name there, which is what both virtual hosts below do with the redirect this function prints,
# and what the checks at the end of this script look for. Two addresses for one page are two
# pages to a crawler, and a link copied from the other name would keep sending its visitors
# through one more hop.
#
# The app answers the same redirect as well, because a request does not always arrive through the
# host this script writes: the `:443` host certbot created once keeps its own copy of the
# directives, and is not rewritten while the certificate is there.
#
# The address of the deployment, and with it the scheme of the redirect: https:// wherever a
# browser can reach this site over TLS - the certificate certbot installs, or the proxy in front
# of --behind-proxy - and http:// on a host that serves plain HTTP with nothing in front
# (--no-tls without --behind-proxy), where nothing answers on port 443 and a redirect to https://
# would point at it. app_run passes the same scheme to the build, so the site it declares is the
# one this redirect names.
site_scheme() {
  if [ "$WITH_TLS" -eq 0 ] && [ "$WITH_PROXY" -eq 0 ]; then
    printf 'http'
  else
    printf 'https'
  fi
}

# The block both virtual hosts put above their catch-all ProxyPass, so that the name which is
# not the canonical one answers with a redirect to it - path and query intact, since a visitor
# who follows a link to /koha-hosting/?page=2 has to land on that page and not on the homepage.
canonical_host_directives() {
  # Only the dots need escaping: a hostname is letters, digits, dots and dashes, and the check
  # above has refused everything else. The optional port lets the same rule answer on a host
  # that serves a spare port of its own; a visitor's browser sends no port for 80 and 443.
  local alias_re="${DOMAIN_ALIAS//./\\.}"
  local scheme
  scheme="$(site_scheme)"

  cat <<CANONICAL
  # One site, one address: $DOMAIN is the canonical name, the one the canonical link of every
  # page and the sitemap carry, so a request that arrives under the other name is answered here
  # with a permanent redirect to it. mod_rewrite names mod_proxy as a prerequisite and so runs
  # before it in the translation phase, and the [R] flag turns the match into a response of its
  # own: this answer wins over the catch-all ProxyPass below even though it sits above it.
  #
  # /.well-known/acme-challenge/ is the exception, so a certificate renewal answers on either
  # name with no redirect in between to follow.
  RewriteEngine On
  RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
  RewriteCond %{HTTP_HOST} ^${alias_re}(:[0-9]+)?\$ [NC]
  RewriteRule ^ ${scheme}://$DOMAIN%{REQUEST_URI} [R=301,L]
CANONICAL
}

render_vhost() {
  if [ "$WITH_PROXY" -eq 1 ]; then
    cat <<APACHE
<VirtualHost *:80>
  ServerName $DOMAIN
  ServerAlias $DOMAIN_ALIAS

$(canonical_host_directives)

  # The app has to see the real host name: the forms compare Astro.url.host with the Origin
  # header of a submission.
  ProxyPreserveHost On

  # The proxy in front ends TLS and appends the visitor's address to X-Forwarded-For. Apache
  # must not add a hop of its own: the rate limit reads the last hop, and Apache's own hop
  # would be the proxy's address for every visitor. setifempty keeps the scheme that proxy
  # reports and only falls back to the scheme of this connection.
  ProxyAddHeaders Off
  RequestHeader setifempty X-Forwarded-Proto expr=%{REQUEST_SCHEME}

  # The sitemap of the previous site. Search Console holds its address, and a crawler that
  # still asks for it has to land on the sitemap of this site. The app answers the same
  # redirect (astro.config.mjs); this one does it without a trip through Node. The exclusion
  # has to come before the catch-all ProxyPass below, or mod_proxy answers first.
  ProxyPass /page-sitemap.xml !
  RedirectMatch 301 ^/page-sitemap\.xml$ /sitemap.xml

  # retry=0: Apache keeps a failed backend connection in its error state for 60 seconds by
  # default, which would answer 503 for a while after every restart of the service.
  ProxyPass / http://127.0.0.1:$PORT/ retry=0
  ProxyPassReverse / http://127.0.0.1:$PORT/

  ErrorLog \${APACHE_LOG_DIR}/$SERVICE-error.log
  CustomLog \${APACHE_LOG_DIR}/$SERVICE-access.log combined

$(compression_directives)
$(caching_directives)
$(security_directives)
</VirtualHost>
APACHE
    return 0
  fi

  cat <<APACHE
<VirtualHost *:80>
  ServerName $DOMAIN
  ServerAlias $DOMAIN_ALIAS

$(canonical_host_directives)

  # The app has to see the real host name: the forms compare Astro.url.host with the Origin
  # header of a submission. mod_proxy appends the client address to X-Forwarded-For on its
  # own, and the rate limit reads that last hop.
  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto expr=%{REQUEST_SCHEME}

  # The sitemap of the previous site. Search Console holds its address, and a crawler that
  # still asks for it has to land on the sitemap of this site. The app answers the same
  # redirect (astro.config.mjs); this one does it without a trip through Node. The exclusion
  # has to come before the catch-all ProxyPass below, or mod_proxy answers first.
  ProxyPass /page-sitemap.xml !
  RedirectMatch 301 ^/page-sitemap\.xml$ /sitemap.xml

  # retry=0: Apache keeps a failed backend connection in its error state for 60 seconds by
  # default, which would answer 503 for a while after every restart of the service.
  ProxyPass / http://127.0.0.1:$PORT/ retry=0
  ProxyPassReverse / http://127.0.0.1:$PORT/

  ErrorLog \${APACHE_LOG_DIR}/$SERVICE-error.log
  CustomLog \${APACHE_LOG_DIR}/$SERVICE-access.log combined

$(compression_directives)
$(caching_directives)
$(security_directives)
</VirtualHost>
APACHE
}

configure_apache() {
  info "[8/11] Apache virtual host for $DOMAIN"

  if [ "$WITH_APACHE" -eq 0 ]; then
    info "--no-apache: leaving Apache alone."
    return 0
  fi

  if [ "$WITH_TLS" -eq 1 ]; then
    run a2enmod -q proxy proxy_http headers ssl rewrite
  else
    run a2enmod -q proxy proxy_http headers rewrite
    # Without ssl_module Apache does not listen on 443 - Debian's ports.conf puts that Listen
    # line inside <IfModule ssl_module> - so a host that serves plain HTTP cannot answer
    # there. The deploy that ran before this one may have enabled the module for its
    # certificate, and that certificate is no longer served by this host.
    if [ -e /etc/apache2/mods-enabled/ssl.load ]; then
      info "disabling mod_ssl: this host serves plain HTTP, so it does not listen on 443"
      run a2dismod -q ssl
    fi
  fi

  # The redirect of the previous site's sitemap (see render_vhost) is a `RedirectMatch`, which
  # is mod_alias. Debian ships that module enabled, and a host where it was turned off answers
  # that path with the app's own redirect instead (astro.config.mjs), so this must not be able
  # to fail the deploy.
  run a2enmod -q alias || true

  # Apache compresses what it serves with mod_deflate's gzip by default; Brotli is smaller
  # for the same types, and setenvif is what lets it take the requests it can serve (see
  # compression_directives). render_vhost adds the filter only under
  # <IfModule mod_brotli.c>, so a host without the module still runs - without those types.
  if [ -e /etc/apache2/mods-available/brotli.load ]; then
    run a2enmod -q brotli setenvif
  else
    warn "mod_brotli is not available here; responses are compressed with gzip only."
  fi

  if write_config 644 root:root "/etc/apache2/sites-available/$SERVICE.conf" < <(render_vhost); then
    info "enabling the new site"
  else
    info "/etc/apache2/sites-available/$SERVICE.conf is already up to date"
  fi
  run a2ensite -q "$SERVICE"

  if [ -e /etc/apache2/sites-enabled/000-default.conf ]; then
    info "disabling the Apache default site, so this vhost owns port 80"
    run a2dissite -q 000-default
  fi

  if [ "$DRY_RUN" -eq 0 ] && ! apache2ctl configtest; then
    warn "Apache rejected the configuration above; the site stays disabled."
    a2dissite -q "$SERVICE" || true
    fail "apache2ctl configtest failed."
  fi

  run systemctl enable --now apache2
  run systemctl reload apache2
}

# --- 9/11 TLS ---------------------------------------------------------------------------
obtain_certificate() {
  info "[9/11] TLS for $DOMAIN"

  if [ "$WITH_PROXY" -eq 1 ]; then
    info "skipped: the proxy in front ends TLS"
    return 0
  fi

  if [ "$WITH_TLS" -eq 0 ] || [ "$WITH_APACHE" -eq 0 ]; then
    info "skipped (--no-tls or --no-apache)"
    return 0
  fi

  if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    info "a certificate for $DOMAIN exists already"
    return 0
  fi

  local account=(--register-unsafely-without-email)
  if [ -n "$EMAIL" ]; then
    account=(-m "$EMAIL")
  else
    warn "No --email given: certbot registers without one, so expiry warnings are not sent."
  fi

  info "requesting a certificate; $DOMAIN and $DOMAIN_ALIAS have to resolve to this server"
  if run certbot --apache --non-interactive --agree-tos --no-eff-email \
      "${account[@]}" --redirect -d "$DOMAIN" -d "$DOMAIN_ALIAS"; then
    [ "$DRY_RUN" -eq 1 ] || info "certificate issued"
  else
    warn "certbot did not get a certificate; the site is served over plain HTTP."
    warn "Once the names resolve here: certbot --apache -d $DOMAIN -d $DOMAIN_ALIAS"
  fi

  if [ "$DRY_RUN" -eq 1 ] || systemctl list-unit-files --type=timer 2>/dev/null | grep -q '^certbot.timer'; then
    run systemctl enable --now certbot.timer
  fi
}

# --- 10/11 checks -----------------------------------------------------------------------
# /search-index.json is the one route that reads the pages of the site back from
# http://127.0.0.1:$PORT, so it proves both that the server can reach itself and that the
# index it serves is complete - for every language.
check_search_index() {
  local base="$1" language json
  local languages=("gb" "fi")

  for language in "${languages[@]}"; do
    json="$(curl -fsS --max-time 30 "$base/search-index.json?l=$language")" || {
      warn "$base/search-index.json?l=$language did not answer."
      return 1
    }

    # shellcheck disable=SC2016  # the ${...} below belongs to the JavaScript, not to bash
    printf '%s' "$json" | node -e '
      const entries = JSON.parse(require("fs").readFileSync(0, "utf8"));
      if (!Array.isArray(entries)) {
        console.error("FAIL the search index is not an array");
        process.exit(1);
      }
      const noText = entries.filter((entry) => !entry.content || entry.content.trim() === "");
      const incomplete = entries.filter((entry) => !entry.slug || !entry.title || !entry.description);
      if (entries.length === 0 || noText.length > 0 || incomplete.length > 0) {
        console.error(`FAIL ${entries.length} entries, ${noText.length} without page text, ${incomplete.length} incomplete`);
        if (noText.length > 0) console.error(`     without text: ${noText.map((entry) => entry.slug).join(", ")}`);
        process.exit(1);
      }
      console.log(`ok   ${entries.length} entries, every one with page text`);
    ' || return 1
  done
}

verify_deployment() {
  info "[10/11] Checking the deployment"

  if [ "$DRY_RUN" -eq 1 ]; then
    info "would wait for http://127.0.0.1:$PORT/, check both languages and the search index"
    [ "$WITH_APACHE" -eq 1 ] && info "would check http://127.0.0.1/ with Host: $DOMAIN"
    [ "$WITH_APACHE" -eq 1 ] && info "would check that Apache moves Host: $DOMAIN_ALIAS to $DOMAIN"
    info "would check that the app moves Host: $DOMAIN_ALIAS to $DOMAIN as well"
    [ "$WITH_PROXY" -eq 1 ] && info "would send X-Forwarded-Proto: https, like the proxy in front"
    info "would post to /contact/ with Origin: https://$DOMAIN, the way a browser does"
    return 0
  fi

  # With --behind-proxy the two Host checks send the headers a TLS-terminating proxy adds, so
  # they follow the path the visitors take instead of talking to loopback on their own.
  local proxy_headers=()
  if [ "$WITH_PROXY" -eq 1 ]; then
    proxy_headers=(-H 'X-Forwarded-Proto: https' -H 'X-Forwarded-For: 203.0.113.7')
  fi

  # The checks below only speak HTTP, so they also pass when another process holds the port
  # and answers for a service that is restarting in a loop. Look at the unit first.
  if ! systemctl is-active --quiet "$SERVICE"; then
    warn "$SERVICE is $(systemctl is-active "$SERVICE" 2>/dev/null || true), not active:"
    if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/"; then
      warn "Something else is already answering on 127.0.0.1:$PORT (a dev server? find it with"
      warn "ss -ltnp), so the site is not being served by this deployment."
    fi
    journalctl -u "$SERVICE" -n 20 --no-pager >&2 || true
    fail "$SERVICE is not running; stop whatever holds $HOST:$PORT and re-run this script."
  fi

  if ! wait_for_http "http://127.0.0.1:$PORT/" 30; then
    warn "The service did not answer within 30 seconds."
    journalctl -u "$SERVICE" -n 20 --no-pager >&2 || true
    fail "$SERVICE did not answer on http://127.0.0.1:$PORT/"
  fi
  info "the Node process answers on http://127.0.0.1:$PORT"

  # Reading the page into a variable rather than piping it into grep: with pipefail, grep
  # closing the pipe early would make curl fail with "23 Failure writing output".
  local page
  page="$(curl -fsS --max-time 30 "http://127.0.0.1:$PORT/")" \
    || fail "The homepage did not answer."
  case "$page" in
    *Hypernova*) ;;
    *) fail "The homepage did not contain the site name." ;;
  esac

  page="$(curl -fsS --max-time 30 "http://127.0.0.1:$PORT/?l=fi")" \
    || fail "The Finnish homepage did not answer."
  case "$page" in
    *'lang="fi"'*) ;;
    *) fail "The Finnish homepage did not render in Finnish." ;;
  esac
  info "the homepage renders in both languages"

  local redirect
  redirect="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    "http://127.0.0.1:$PORT/lainuri-self-checkout-machine/")"
  case "$redirect" in
    301 | 308) info "a legacy URL redirects with $redirect" ;;
    *) warn "a legacy URL answered $redirect instead of a redirect" ;;
  esac

  check_search_index "http://127.0.0.1:$PORT" \
    || fail "The search index is incomplete (see the FAIL line); check the service log."
  info "the search index carries page text in both languages"

  # Ask the server with the public Host header. The built server does not check that header,
  # so a 403 with a "Blocked request" body means something else owns the port: the dev and
  # preview servers do apply that check (server.allowedHosts), and a leftover one is easy to
  # mistake for the deployment because it answers with real pages.
  local host_code host_body
  host_body="$(mktemp)"
  host_code="$(curl -sS -o "$host_body" -w '%{http_code}' --max-time 15 \
    -H "Host: $DOMAIN" "${proxy_headers[@]}" "http://127.0.0.1:$PORT/")" || host_code=000
  if [ "$host_code" != 200 ]; then
    if grep -q 'Blocked request' "$host_body" 2>/dev/null; then
      fail "Host: $DOMAIN got \"403 Blocked request\" on 127.0.0.1:$PORT. That host check belongs
   to a development server, so a leftover 'npm run dev' or 'astro preview' holds the port and
   $SERVICE is not the process answering. Stop it (ss -ltnp) and re-run this script."
    fi
    fail "The server answered $host_code for Host: $DOMAIN on 127.0.0.1:$PORT."
  fi
  rm -f "$host_body"
  info "the server answers as $DOMAIN"

  # The other name of the site has to move its visitor to the address of the deployment, in a
  # single answer and with the path and the query kept: (site_scheme)://$DOMAIN is what the
  # canonical links name, so that is where a link under the second name has to land. The two
  # checks below ask the two halves of it - Apache, which answers without a trip through Node,
  # and the app itself, which answers a request that never reaches this virtual host.
  local alias_path alias_expected alias_reply alias_code alias_location
  alias_path="/koha-hosting/?probe=1"
  alias_expected="$(site_scheme)://$DOMAIN$alias_path"

  if [ "$WITH_APACHE" -eq 1 ]; then
    local apache_code
    apache_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
      -H "Host: $DOMAIN" "${proxy_headers[@]}" http://127.0.0.1/)" || apache_code=000
    if [ "$apache_code" != 200 ]; then
      fail "Apache answered $apache_code for http://127.0.0.1/ with Host: $DOMAIN, not the
   site: check the virtual host for $DOMAIN and that mod_proxy is enabled."
    fi
    info "Apache proxies $DOMAIN to $HOST:$PORT"

    # Asked with a Host header of the second name, the way a browser asks for it. The redirect is
    # the virtual host's own answer, so nothing here depends on how TLS is ended.
    alias_reply="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 \
      -H "Host: $DOMAIN_ALIAS" "http://127.0.0.1$alias_path")" || alias_reply=000
    alias_code="${alias_reply%% *}"
    alias_location="${alias_reply#* }"
    if [ "$alias_code" != 301 ] || [ "$alias_location" != "$alias_expected" ]; then
      fail "Host: $DOMAIN_ALIAS answered \"$alias_code $alias_location\" for $alias_path instead of
   a 301 to $alias_expected, so the second name of this site is not sending its visitors to the
   address of the deployment: check ServerName/ServerAlias in the virtual host (see
   canonical_host_directives) and that mod_rewrite is enabled (a2enmod rewrite)."
    fi
    info "Apache moves Host: $DOMAIN_ALIAS to $DOMAIN"
  fi

  # The same, asked of the app on its own port: a request does not always arrive through the host
  # this script writes, because the `:443` host certbot created once keeps its own copy of the
  # directives and is not rewritten while the certificate is there. Only a build has an address
  # to redirect to, which is why a development server does not answer this (src/middleware.ts).
  alias_reply="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 \
    -H "Host: $DOMAIN_ALIAS" "http://$HOST:$PORT$alias_path")" || alias_reply=000
  alias_code="${alias_reply%% *}"
  alias_location="${alias_reply#* }"
  if [ "$alias_code" != 301 ] || [ "$alias_location" != "$alias_expected" ]; then
    fail "The app answered \"$alias_code $alias_location\" for Host: $DOMAIN_ALIAS instead of a 301
   to $alias_expected, so a request that does not reach the virtual host is served under the
   second name: check src/utils/canonical-host.ts and its use in src/middleware.ts, and that the
   build was given HYPERNOVA_SITE_URL (app_run sets it from --domain and site_scheme)."
  fi
  info "the app moves Host: $DOMAIN_ALIAS to $DOMAIN as well"

  # A browser posts a form with an https origin, so that is what the check sends. The body
  # carries no valid token, so the app drops the submission as a bot signal - nothing reaches
  # Redmine and no rate-limit slot is used - and answers with the page as usual. A refusal
  # here means the request never reached the form: for example Astro's built-in origin check
  # answers 403 because the Node adapter builds its request URL from the plain HTTP socket and
  # cannot see the https a proxy ended.
  local form_url form_code
  form_url="http://127.0.0.1:$PORT"
  [ "$WITH_APACHE" -eq 1 ] && form_url="http://127.0.0.1"

  form_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "Host: $DOMAIN" "${proxy_headers[@]}" \
    -H "Origin: https://$DOMAIN" -H 'Sec-Fetch-Site: same-origin' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data 'name=deploy-check&email=deploy-check@example.com&content=deploy-check&form_token=invalid' \
    "$form_url/contact/")" || form_code=000

  if [ "$form_code" != 200 ]; then
    fail "Posting to $form_url/contact/ with Origin: https://$DOMAIN answered $form_code, so a
   browser could not submit a form either. Keep 'security.checkOrigin: false' in
   astro.config.mjs - the Node adapter takes the scheme of a request from the socket it
   accepted, so that check refuses the https origin of every visitor behind a proxy - and
   re-run this script."
  fi
  info "a form submission from https://$DOMAIN reaches the app"

  if [ "$WITH_TLS" -eq 1 ]; then
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
      if curl -fsS -o /dev/null --max-time 15 "https://$DOMAIN/"; then
        info "https://$DOMAIN/ answers"
      else
        warn "https://$DOMAIN/ did not answer from this server; check DNS and the certificate."
      fi
    fi
  else
    info "https is not checked here: this host serves plain HTTP"
  fi
}

# --- 11/11 automatic deploys ------------------------------------------------------------
# --auto-update leaves a cron job that repeats this script with --if-changed, so the server
# follows the branch on its own. The job is written from the flags of the run that installed
# it (RERUN_ARGS), which is what makes an automatic deploy the same deploy as a manual one:
# the same --dir, the same unit, the same --behind-proxy.
#
# Such a run can still end on a revision that does not work, and no one is watching it. It then
# undoes its own pull: auto_update_rollback puts back the revision that was live before
# the pull, builds it and restarts the unit, so the domain keeps answering, and the run ends
# there reporting failure - what it was asked to deploy is not live. The job runs again a few
# minutes later and picks up the fix.
auto_update_rollback() {
  # Reachable from fail() and from the ERR trap, and has to happen at most once.
  [ "$ROLLBACK_DONE" -eq 0 ] || return 0
  ROLLBACK_DONE=1
  trap - ERR

  # Nothing was pulled, or this is a rehearsal that changed nothing in the first place.
  if [ "$DRY_RUN" -eq 1 ] || [ -z "$PREVIOUS_REVISION" ]; then
    return 0
  fi

  # The recovery has to run to its end even when a step of it fails.
  set +e
  warn "the revision just deployed did not work out; putting ${PREVIOUS_REVISION:0:12} back"

  if ! app_run "git reset --hard $PREVIOUS_REVISION"; then
    warn "Could not reset $APP_DIR to $PREVIOUS_REVISION: put that checkout right by hand."
    exit 1
  fi
  app_run 'git clean -fd'

  if app_run 'npm ci --no-audit --no-fund' \
    && app_run 'npm run build' \
    && systemctl restart "$SERVICE" \
    && wait_for_http "http://127.0.0.1:$PORT/" 60; then
    protect_app_dir
    info "$SERVICE is back on ${PREVIOUS_REVISION:0:12} and answers on $HOST:$PORT."
  else
    warn "$SERVICE did not come up on ${PREVIOUS_REVISION:0:12} either:"
    warn "journalctl -u $SERVICE -n 50"
  fi

  # The run ends here, and it ends as a failure: it was told to deploy a revision that did not
  # work, the earlier `set +e` has turned off exit-on-error, and the steps that would follow
  # (the unit, Apache, the job) are about this deployment rather than about that revision.
  warn "this run did not deploy; the job runs again and picks up a fix."
  exit 1
}

# True when the command line kept for the next runs already carries $1.
rerun_has() {
  local option="$1" argument
  for argument in "${RERUN_ARGS[@]}"; do
    [ "$argument" = "$option" ] && return 0
  done
  return 1
}

# The cron job itself. It names the remote and the branch, because cron starts the script from
# another directory and a run that is given everything behaves exactly like the run that
# installed it. It adds --no-packages, so an unattended run never stops to install packages.
# `flock` keeps a slow build from overlapping the next run.
render_cron_job() {
  local arguments=("${RERUN_ARGS[@]}") rendered="" argument
  rerun_has --repo || arguments+=(--repo "$RESOLVED_REPO")
  rerun_has --branch || arguments+=(--branch "$RESOLVED_BRANCH")
  rerun_has --auto-update || arguments+=(--auto-update)
  rerun_has --if-changed || arguments+=(--if-changed)
  rerun_has --no-packages || arguments+=(--no-packages)

  for argument in "${arguments[@]}"; do
    rendered="$rendered \"$argument\""
  done

  cat <<CRON
# Automatic deploys for $SERVICE, written by scripts/deploy/install.sh out of the flags of the
# run that installed it: re-run that command to change this file, or run the installer with
# --no-auto-update to stop following the branch.
#
# $CRON_INTERVAL_TEXT this job asks
#   $RESOLVED_REPO
# for $RESOLVED_BRANCH and deploys only when that branch holds a revision other than the one
# in $APP_DIR: the code is updated, the dependencies reinstalled, the bundle rebuilt, the unit
# restarted and the result checked. A revision that fails is replaced by the one that was live
# before it. Everything it prints lands in the journal:
#
#   journalctl -t $CRON_LOG_TAG -n 50
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""
*/$AUTO_UPDATE_EVERY * * * * root flock -n "/run/$CRON_NAME.lock" bash "$APP_DIR/scripts/deploy/install.sh"$rendered 2>&1 | systemd-cat -t $CRON_LOG_TAG
CRON
}

install_auto_update() {
  info "[11/11] Automatic deploys"
  local job="/etc/cron.d/$CRON_NAME"

  if [ "$WITH_AUTO_UPDATE" -eq 0 ]; then
    info "--auto-update was not given: the next version is deployed by re-running this script."
    if [ -f "$job" ]; then
      info "removing $job: this deployment no longer follows the branch on its own."
      run rm -f "$job"
    fi
    return 0
  fi

  if write_config 644 root:root "$job" < <(render_cron_job); then
    info "$CRON_INTERVAL_TEXT: $job looks for commits on $RESOLVED_BRANCH"
    info "what those runs did: journalctl -t $CRON_LOG_TAG"
  else
    info "$job is already up to date"
  fi

  # The file is read only while a cron daemon is running on this host.
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  + systemctl enable --now cron\n'
    return 0
  fi
  if systemctl list-unit-files --type=service 2>/dev/null | grep -q '^cron\.service'; then
    run systemctl enable --now cron
  elif ! pgrep -x cron >/dev/null 2>&1; then
    warn "Nothing is reading /etc/cron.d on this host, so $job will not run."
    warn "Install the cron package (re-run without --no-packages) or move the job to a timer."
  fi
}

# --- run --------------------------------------------------------------------------------
install_packages
ensure_node
ensure_account
sync_code
ensure_env_file
build_app
install_unit
configure_apache
obtain_certificate
verify_deployment
# The revision that was pulled is answering, so a failure from here on (writing the job below)
# is no reason to put the one before it back.
trap - ERR
PREVIOUS_REVISION=""
# Last, so that a first install which does not come up does not leave a job that keeps trying.
install_auto_update

# --- what was done, and what to do next -------------------------------------------------
# The command that repeats this deployment, with the flags it was started with.
RERUN_COMMAND="sudo bash $SCRIPT_DIR/install.sh${RERUN_ARGS[*]:+ ${RERUN_ARGS[*]}}"

printf '\n==> %s is deployed.\n' "$SERVICE"
printf '      status   systemctl status %s\n' "$SERVICE"
printf '      logs     journalctl -u %s -f\n' "$SERVICE"
printf '      restart  systemctl restart %s\n' "$SERVICE"
printf '      code     %s (user %s), served on %s\n' "$APP_DIR" "$APP_USER" "$HOST:$PORT"

cat <<SUMMARY

Deploy the next version with the same command again - it updates the code, reinstalls the
dependencies, rebuilds and restarts the service:

  $RERUN_COMMAND

Editing .env does not change the running site: the Redmine settings and FORM_TOKEN_SECRET
are read while npm run build runs. Re-run this script afterwards, or run
scripts/refresh-search-index.sh on the server, which builds, restarts and checks the index.
SUMMARY

if [ "$WITH_AUTO_UPDATE" -eq 1 ]; then
  cat <<AUTOMATIC

This deployment follows $RESOLVED_BRANCH on its own: $CRON_INTERVAL_TEXT cron runs
this same installer with --if-changed, which stops as soon as it sees that the branch has not
moved, and otherwise updates the code, reinstalls the dependencies, rebuilds, restarts
$SERVICE and checks the result. A revision that fails those checks is replaced by the one that
was live before it.

  what it did   journalctl -t $CRON_LOG_TAG -n 50
  the job       /etc/cron.d/$CRON_NAME
  stop it       re-run the command above with --no-auto-update, or: rm /etc/cron.d/$CRON_NAME

Only what is committed and pushed to $RESOLVED_BRANCH is deployed, and local edits in
$APP_DIR are overwritten by the pull.
AUTOMATIC
fi

if [ "$REDMINE_NOT_CONFIGURED" -eq 1 ]; then
  warn "The Redmine values in $APP_DIR/.env are empty, so the quote and contact forms"
  warn "cannot create issues yet: fill them in and re-run this script."
fi

if [ "$WITH_PROXY" -eq 1 ]; then
  if [ "$WITH_APACHE" -eq 1 ]; then
    PROXY_TARGET="127.0.0.1:80"
  else
    PROXY_TARGET="$HOST:$PORT"
  fi

  cat <<PROXY

This host serves plain HTTP and holds no certificate: the proxy in front ends TLS and answers
on 443. Point it at $PROXY_TARGET and keep two things in mind:

  * it has to pass the visitor's address on in X-Forwarded-For with its own address last,
    because the rate limit counts the last hop;
  * only the proxy should be able to reach $PROXY_TARGET - anyone who can reach it can send
    an X-Forwarded-For of their own and step around the rate limit.
PROXY

  if [ "$HOST" != "127.0.0.1" ]; then
    warn "The Node process listens on $HOST, so the proxy can also reach it from another host:"
    warn "firewall $HOST:$PORT so that only that proxy gets in."
  fi
fi

if [ "$WITH_APACHE" -eq 1 ] && [ "$WITH_TLS" -eq 1 ] && [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  warn "There is no certificate for $DOMAIN yet, so the site answers over HTTP only."
fi

info "Done."
