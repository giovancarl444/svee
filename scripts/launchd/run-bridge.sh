#!/bin/zsh
# =============================================================================
# CORTEX — launchd wrapper for the read-only iMessage bridge.
#
#   scripts/launchd/run-bridge.sh
#
# The com.cortex.bridge LaunchAgent execs THIS. It:
#   1. resolves the repo from its own location,
#   2. sources the login shell so python3 resolves,
#   3. reads IMESSAGE_BRIDGE_TOKEN out of the repo's .env AT RUNTIME (never baked
#      into any committed/installed file) and exports it,
#   4. execs `python3 services/imessage-bridge/bridge.py`.
#
# The secret is only ever in .env (gitignored) and in the process env of this
# short-lived exec — it is never written to a plist or logged.
#
# bridge.py also honors IMESSAGE_BRIDGE_HOST/PORT/IMESSAGE_DB_PATH from .env if
# set; those are passed through the same login-shell env if present.
# =============================================================================
set -eu

SCRIPT_DIR="${0:A:h}"                 # zsh: absolute dir of this script
REPO="${SCRIPT_DIR:h:h}"             # …/scripts/launchd -> repo root
ENV_FILE="$REPO/.env"

cd "$REPO"

if [ -f "$HOME/.zprofile" ]; then . "$HOME/.zprofile" 2>/dev/null || true; fi
if [ -f "$HOME/.zshrc" ];    then . "$HOME/.zshrc"    2>/dev/null || true; fi
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ ! -f "$ENV_FILE" ]; then
  echo "[run-bridge] ERROR: $ENV_FILE not found — cannot read IMESSAGE_BRIDGE_TOKEN" >&2
  exit 1
fi

# Pull the token from .env without sourcing the whole file (avoids executing
# arbitrary .env lines). Take the last non-comment assignment, strip optional
# surrounding quotes and trailing whitespace/CR.
read_env() {
  # $1 = key
  grep -E "^[[:space:]]*$1=" "$ENV_FILE" 2>/dev/null \
    | grep -vE '^[[:space:]]*#' \
    | tail -n 1 \
    | sed -E "s/^[[:space:]]*$1=//; s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/; s/[[:space:]]*$//; s/\r$//"
}

IMESSAGE_BRIDGE_TOKEN="$(read_env IMESSAGE_BRIDGE_TOKEN)"
if [ -z "${IMESSAGE_BRIDGE_TOKEN:-}" ]; then
  echo "[run-bridge] ERROR: IMESSAGE_BRIDGE_TOKEN is empty in $ENV_FILE" >&2
  exit 1
fi
export IMESSAGE_BRIDGE_TOKEN

# Optional passthroughs (only export if actually set in .env).
for k in IMESSAGE_BRIDGE_HOST IMESSAGE_BRIDGE_PORT IMESSAGE_DB_PATH; do
  v="$(read_env "$k")"
  [ -n "$v" ] && export "$k=$v"
done

echo "[run-bridge] $(date '+%Y-%m-%dT%H:%M:%S%z') starting bridge.py in $REPO (python3=$(command -v python3 || echo MISSING), token=****)"

exec python3 "$REPO/services/imessage-bridge/bridge.py"
