#!/usr/bin/env bash
#
# Refresh the search index the deployed site serves, and prove that it is fresh.
#
# `/search-index.json` (src/pages/search-index.json.ts) is generated per request from the
# running server bundle, so there is no cached file to purge: "refreshing" the index means
# building, restarting the SSR process Apache proxies to, and then checking that the live
# URL returns exactly the payload the new build produces.
#
# This script does those three steps in order:
#   1. npm run build                (skip with --no-build)
#   2. restart the service          (skip with --no-restart)
#   3. start the freshly built bundle on a spare port and compare /search-index.json for
#      every language against the live URL, validating the entry shape on the way.
#
# Usage:
#   scripts/refresh-search-index.sh
#   scripts/refresh-search-index.sh --url https://www.hypernova.fi --service hypernova
#   scripts/refresh-search-index.sh --restart "sudo systemctl restart hypernova"
#   scripts/refresh-search-index.sh --no-build --no-restart   # compare, change nothing
#
# Run it on the machine that serves the site: `.env` is read while `npm run build` runs, so
# the build has to use the values the deployment uses (see "Deployment" in README.md).
#
# Exit status: 0 = the live index matches the new build, 1 = it does not (or a check
# failed), 2 = the arguments or the environment are wrong.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname -- "$SCRIPT_DIR")"

# Every language the index is localized for (src/i18n/ui.ts).
LANGS="gb fi"

# Mirrors astro.config.mjs (`site`) and the service name used on the servers. All of them
# can be overridden per run or through the environment.
BASE_URL="${HYPERNOVA_URL:-https://www.hypernova.fi}"
SERVICE="${HYPERNOVA_SERVICE:-hypernova}"
RESTART_CMD="${HYPERNOVA_RESTART_CMD:-}"
PROBE_PORT="${HYPERNOVA_PROBE_PORT:-4399}"
WAIT_SECONDS=60
DO_BUILD=1
DO_RESTART=1

info() { printf '==> %s\n' "$*"; }
warn() { printf '!!! %s\n' "$*" >&2; }
fail() { printf '!!! %s\n' "$*" >&2; exit 2; }

usage() {
  cat <<'USAGE'
Refresh the search index of the deployed site (build, restart, verify).

Usage: scripts/refresh-search-index.sh [options]

  -u, --url URL         Base URL of the running site (default: https://www.hypernova.fi)
  -s, --service UNIT    systemd unit to restart (default: hypernova)
  -r, --restart CMD     Restart with this shell command instead of systemd
  -p, --probe-port PORT First port to try for the local comparison server (default: 4399)
  -w, --wait SECONDS    How long to wait for a server to answer (default: 60)
      --no-build        Do not run `npm run build`
      --no-restart      Do not restart anything, only compare
  -h, --help            Show this help

Environment: HYPERNOVA_URL, HYPERNOVA_SERVICE, HYPERNOVA_RESTART_CMD, HYPERNOVA_PROBE_PORT.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    -u|--url) BASE_URL="${2:?--url needs a value}"; shift 2 ;;
    -s|--service) SERVICE="${2:?--service needs a value}"; shift 2 ;;
    -r|--restart) RESTART_CMD="${2:?--restart needs a value}"; shift 2 ;;
    -p|--probe-port) PROBE_PORT="${2:?--probe-port needs a value}"; shift 2 ;;
    -w|--wait) WAIT_SECONDS="${2:?--wait needs a value}"; shift 2 ;;
    --no-build) DO_BUILD=0; shift ;;
    --no-restart) DO_RESTART=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "Unknown option: $1" ;;
  esac
done

BASE_URL="${BASE_URL%/}"

command -v node >/dev/null 2>&1 || fail "node is not on PATH (the site needs Node >= 22.12)"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] ||
  fail "node 18 or newer is required (the checks use fetch)"

SERVER_ENTRY="$ROOT_DIR/dist/server/entry.mjs"
PROBE_PID=""
PROBE_LOG=""

cleanup() {
  if [ -n "$PROBE_PID" ] && kill -0 "$PROBE_PID" 2>/dev/null; then
    kill "$PROBE_PID" 2>/dev/null || true
    wait "$PROBE_PID" 2>/dev/null || true
  fi
  [ -n "$PROBE_LOG" ] && rm -f "$PROBE_LOG"
  return 0
}
trap cleanup EXIT

# Wait until a URL answers with JSON, or give up after $2 seconds. A restart makes the
# service unreachable for a moment, so the first attempts are expected to fail.
wait_for_url() {
  WAIT_URL="$1" WAIT_SECONDS="$2" node --input-type=module -e '
    const url = process.env.WAIT_URL;
    const deadline = Date.now() + Number(process.env.WAIT_SECONDS) * 1000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (response.ok && (await response.json())) process.exit(0);
      } catch {
        // Not up yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    process.exit(1);
  '
}

# First port at or above $1 that nothing is listening on.
find_free_port() {
  local port="$1"
  for _ in $(seq 1 20); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
  done
  return 1
}

restart_service() {
  if [ -n "$RESTART_CMD" ]; then
    info "Restarting: $RESTART_CMD"
    bash -c "$RESTART_CMD"
    return
  fi

  local unit="$SERVICE"
  [[ "$unit" == *.* ]] || unit="${unit}.service"

  command -v systemctl >/dev/null 2>&1 || fail "systemctl not found - pass --restart CMD"
  systemctl list-unit-files "$unit" --no-legend --no-pager 2>/dev/null | grep -q "^${unit}" ||
    fail "unknown systemd unit $unit - pass --service or --restart CMD"

  if [ "${EUID}" -eq 0 ]; then
    info "Restarting $unit"
    systemctl restart "$unit"
  else
    info "Restarting $unit (with sudo)"
    sudo systemctl restart "$unit"
  fi
}

# ---- 1. Build -------------------------------------------------------------------------

if [ "$DO_BUILD" -eq 1 ]; then
  info "Building the site in $ROOT_DIR"
  (cd "$ROOT_DIR" && npm run build)
else
  info "Skipping the build (--no-build), comparing against the bundle already in dist/"
fi

[ -f "$SERVER_ENTRY" ] || fail "$SERVER_ENTRY is missing - run without --no-build"

# ---- 2. Restart -----------------------------------------------------------------------

if [ "$DO_RESTART" -eq 1 ]; then
  restart_service
  info "Waiting for $BASE_URL to answer again"
  wait_for_url "$BASE_URL/search-index.json?l=gb" "$WAIT_SECONDS" ||
    fail "$BASE_URL did not serve JSON within ${WAIT_SECONDS}s after the restart"
else
  info "Skipping the restart (--no-restart)"
fi

# ---- 3. Compare the live index with the freshly built one ------------------------------

PROBE_PORT="$(find_free_port "$PROBE_PORT")" ||
  fail "no free port found for the comparison server"
PROBE_BASE="http://127.0.0.1:${PROBE_PORT}"
PROBE_LOG="$(mktemp)"

info "Starting the new build on $PROBE_BASE for comparison"
HOST=127.0.0.1 PORT="$PROBE_PORT" node "$SERVER_ENTRY" >"$PROBE_LOG" 2>&1 &
PROBE_PID=$!

if ! wait_for_url "$PROBE_BASE/search-index.json?l=gb" 30; then
  warn "The new build did not answer on $PROBE_BASE:"
  tail -n 20 "$PROBE_LOG" >&2 || true
  fail "cannot compare the indexes without the new build running"
fi

info "Comparing /search-index.json on $BASE_URL and $PROBE_BASE ($LANGS)"

STATUS=0
CHECK_LIVE_BASE="$BASE_URL" CHECK_PROBE_BASE="$PROBE_BASE" CHECK_LANGS="$LANGS" \
  node --input-type=module -e "$(cat <<'NODE'
const FIELDS = ['slug', 'title', 'description', 'keywords', 'content', 'type'];
const langs = (process.env.CHECK_LANGS ?? 'gb').trim().split(/\s+/);
const bases = {
  'live site': process.env.CHECK_LIVE_BASE,
  'new build': process.env.CHECK_PROBE_BASE,
};

const problems = [];
const notes = [];
const matches = [];

async function load(base, lang) {
  const url = `${base}/search-index.json?l=${lang}`;
  let response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (cause) {
    const reason = cause?.cause?.code ?? cause?.message ?? 'fetch failed';
    throw new Error(`cannot reach ${url} (${reason})`);
  }
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    problems.push(`${url}: expected JSON, got "${contentType}"`);
  }

  return { url, headers: response.headers, entries: await response.json() };
}

function checkShape(url, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    problems.push(`${url}: expected a non-empty array of index entries`);
    return;
  }

  const slugs = new Set();
  entries.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      problems.push(`${url}: entry ${index} is not an object`);
      return;
    }

    for (const field of FIELDS) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        problems.push(`${url}: entry ${index} (${entry.slug ?? '?'}) has no ${field}`);
      }
    }

    if (typeof entry.slug === 'string' && !entry.slug.startsWith('/')) {
      problems.push(`${url}: entry ${index} has a relative slug "${entry.slug}"`);
    }
    if (slugs.has(entry.slug)) problems.push(`${url}: duplicate slug ${entry.slug}`);
    slugs.add(entry.slug);
  });
}

for (const lang of langs) {
  let live;
  let probe;
  try {
    live = await load(bases['live site'], lang);
    probe = await load(bases['new build'], lang);
  } catch (error) {
    problems.push(`${lang}: ${error.message}`);
    continue;
  }

  checkShape(live.url, live.entries);
  checkShape(probe.url, probe.entries);

  // The palette caches the payload per page load, so a shared proxy must never cache it
  // and hand one language's index to another visitor (README, "Search (command palette)").
  const cacheControl = live.headers.get('cache-control') ?? '';
  if (!/private/.test(cacheControl) || !/no-cache/.test(cacheControl)) {
    notes.push(`${lang}: Cache-Control is "${cacheControl}", expected "private, no-cache"`);
  }
  if (!/cookie/i.test(live.headers.get('vary') ?? '')) {
    notes.push(`${lang}: Vary does not mention Cookie`);
  }

  if (!Array.isArray(live.entries) || !Array.isArray(probe.entries)) continue;

  const liveSlugs = new Set(live.entries.map((entry) => entry.slug));
  const probeSlugs = new Set(probe.entries.map((entry) => entry.slug));
  const missing = [...probeSlugs].filter((slug) => !liveSlugs.has(slug));
  const extra = [...liveSlugs].filter((slug) => !probeSlugs.has(slug));

  if (missing.length > 0) {
    problems.push(`${lang}: the running site is missing ${missing.join(', ')} - restart it`);
  }
  if (extra.length > 0) {
    problems.push(`${lang}: the running site still serves ${extra.join(', ')} - restart it`);
  }

  if (JSON.stringify(live.entries) === JSON.stringify(probe.entries)) {
    matches.push(`${lang}: ${live.entries.length} entries, identical to the new build`);
  } else {
    const index = live.entries.findIndex(
      (entry, position) => JSON.stringify(entry) !== JSON.stringify(probe.entries[position])
    );
    problems.push(
      `${lang}: the running site differs from the new build ` +
        `(first difference at entry ${index}: ${live.entries[index]?.slug ?? 'unknown'})`
    );
  }
}

for (const line of matches) console.log(`ok   ${line}`);
for (const line of notes) console.log(`note ${line}`);
for (const line of problems) console.log(`FAIL ${line}`);

process.exit(problems.length === 0 ? 0 : 1);


NODE
)" || STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  info "The live index is up to date. Browsers pick it up on the next page load."
else
  warn "The live index does not match the new build (see the FAIL lines above)."
  warn "Check that the service actually restarted, that it runs the bundle just built"
  warn "(npm start in $ROOT_DIR) and that Apache proxies to that process."
fi

exit "$STATUS"


