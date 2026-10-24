#!/usr/bin/env bash
#
# Guards the deployment's .env.
#
# The unit starts the Node process whatever the state of $APP_DIR/.env is: `EnvironmentFile=-…`
# makes the file optional, and a bundle that was built while the file was there keeps answering
# without it. So a deployment that has *lost* the file - a hand-run `mv`, a restore from a backup
# that did not carry it, a disk that came back partial - goes on serving pages that cannot submit
# a form, and nothing anywhere says so. This is what says so, in the two places a person actually
# looks, and it takes the site down so that an uptime check sees it as well.
#
#   --run CMD [ARG...]   check, then become CMD. Refuses to start the site when the file is gone,
#                        with exit 78 (EX_CONFIG), which the unit declares as "do not restart":
#                        a start every two seconds for a file nothing is going to restore only
#                        fills the journal.
#   --watch              the same check for a timer. When the file is gone: one message to the
#                        journal and to syslog, then the unit is stopped. When it is back: one
#                        message, then the unit is started again. The marker in /run is what makes
#                        each of those happen once instead of every minute, and what tells this
#                        script that it was the one that stopped the unit.
#   --check              report and exit: 0 when the file is intact, 1 when it is not.
#
# What "intact" means is deliberately conservative: the file exists, is not empty, can be read,
# and carries a FORM_TOKEN_SECRET line. A value that is empty is *not* fatal - the app generates
# a key of its own in that case and forms still work - so it is reported, not acted on.
set -uo pipefail

SERVICE="${HYPERNOVA_SERVICE:-hypernova}"
ENV_FILE="${HYPERNOVA_ENV_FILE_PATH:-/opt/hypernova/app/.env}"
MARKER="${HYPERNOVA_ENV_LOST_MARKER:-/run/${SERVICE}-env-lost}"
TAG="${HYPERNOVA_ENV_LOG_TAG:-${SERVICE}-env}"
EX_CONFIG=78

# The reason the file is not usable, or nothing at all when it is.
problem() {
  if [ ! -e "$ENV_FILE" ]; then
    printf 'missing'
    return 0
  fi
  if [ ! -s "$ENV_FILE" ]; then
    printf 'empty'
    return 0
  fi
  if [ ! -r "$ENV_FILE" ]; then
    printf 'unreadable by %s' "$(id -un 2>/dev/null || printf 'the service user')"
    return 0
  fi
  if ! grep -q '^FORM_TOKEN_SECRET=' "$ENV_FILE" 2>/dev/null; then
    printf 'without a FORM_TOKEN_SECRET line'
    return 0
  fi
  printf ''
}

# A FORM_TOKEN_SECRET that is there but empty is worth a word and nothing more: the app makes a
# key of its own when it starts, so forms work, and the only cost is that a form open across a
# restart is dropped. The deploy warns about it too (`REDMINE_NOT_CONFIGURED`).
emptySecret() {
  grep -qE '^FORM_TOKEN_SECRET=["'"'"']?["'"'"']?[[:space:]]*$' "$ENV_FILE" 2>/dev/null
}

# One message, in the three places a person looks: the unit's own journal (stderr, tagged with the
# unit's SyslogIdentifier), the journal under a tag of its own, and syslog - so `journalctl -t
# <service>-env` finds it, a syslog match rule finds it, and an alert on either sees it.
announce() {
  local priority="$1" message="$2"

  printf '%s: %s\n' "$TAG" "$message" >&2
  if command -v systemd-cat >/dev/null 2>&1; then
    printf '%s\n' "$message" | systemd-cat -t "$TAG" -p "$priority" 2>/dev/null || true
  fi
  if command -v logger >/dev/null 2>&1; then
    logger -t "$TAG" -p "$priority" -- "$message" 2>/dev/null || true
  fi
  return 0
}

mode="${1:-}"
[ "$#" -gt 0 ] && shift

case "$mode" in
  --run)
    if [ "$#" -lt 1 ]; then
      announce err "$TAG was given no command to start"
      exit "$EX_CONFIG"
    fi

    reason="$(problem)"
    if [ -n "$reason" ]; then
      announce alert "$ENV_FILE is $reason: refusing to start $SERVICE. The deployment cannot answer its own forms without the file that carries FORM_TOKEN_SECRET and the Redmine settings. Restore it (scripts/deploy/install.sh writes it) and start the unit again."
      exit "$EX_CONFIG"
    fi

    if emptySecret; then
      announce warning "$ENV_FILE carries an empty FORM_TOKEN_SECRET: the app will generate a key of its own, so a form that is open across a restart is dropped. Fill it in and re-run the deploy."
    fi

    exec "$@"
    ;;

  --watch)
    reason="$(problem)"

    if [ -n "$reason" ]; then
      if [ -e "$MARKER" ]; then
        # Already reported, and the unit is already down: saying it again every minute would
        # bury the one message that matters.
        exit 0
      fi

      announce alert "$ENV_FILE is $reason: stopping $SERVICE, so that the site stops answering for a deployment whose configuration is gone. Restore the file and this check starts the unit again on its next run."
      : > "$MARKER" 2>/dev/null || true
      systemctl stop "$SERVICE" 2>/dev/null || true
      exit 1
    fi

    if [ -e "$MARKER" ]; then
      rm -f "$MARKER" 2>/dev/null || true
      announce notice "$ENV_FILE is back: starting $SERVICE again."
      systemctl start "$SERVICE" 2>/dev/null || true
    fi

    if emptySecret; then
      announce warning "$ENV_FILE carries an empty FORM_TOKEN_SECRET: forms work, but a form that is open across a restart is dropped. Fill it in and re-run the deploy."
    fi
    exit 0
    ;;

  --check)
    reason="$(problem)"
    if [ -n "$reason" ]; then
      announce alert "$ENV_FILE is $reason"
      exit 1
    fi
    if emptySecret; then
      announce warning "$ENV_FILE carries an empty FORM_TOKEN_SECRET"
      exit 0
    fi
    printf '%s is intact\n' "$ENV_FILE"
    exit 0
    ;;

  *)
    printf 'usage: %s --run CMD [ARG...] | --watch | --check\n' "${0##*/}" >&2
    exit 2
    ;;
esac
