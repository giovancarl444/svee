#!/bin/zsh
# =============================================================================
# CORTEX — launchd wrapper for the always-on scheduler.
#
#   scripts/launchd/run-workers.sh
#
# The com.cortex.workers LaunchAgent execs THIS. launchd runs with a bare
# environment, so we source the login shell (zsh -l) to reproduce the exact
# PATH/pnpm/node an interactive terminal has, then cd to the repo and exec the
# serve scheduler. The app loads .env itself (loadLocalEnv), so no secret is
# read or exported here.
#
# Requires: docker Postgres (127.0.0.1:5432) + Ollama (127.0.0.1:11434). If
# they're not up yet, `serve` exits non-zero and launchd relaunches after the
# plist's ThrottleInterval (~30s).
#
# Resolve the repo from this script's own location — no hardcoded path needed.
# =============================================================================
set -eu

SCRIPT_DIR="${0:A:h}"                 # zsh: absolute dir of this script
REPO="${SCRIPT_DIR:h:h}"             # …/scripts/launchd -> repo root

cd "$REPO"

# Source the user's login shell so PATH (and pnpm/node/tsx) resolve. -l reads
# ~/.zprofile / ~/.zshrc as an interactive login would. Non-fatal if a profile
# line errors — we only care about PATH.
if [ -f "$HOME/.zprofile" ]; then . "$HOME/.zprofile" 2>/dev/null || true; fi
if [ -f "$HOME/.zshrc" ];    then . "$HOME/.zshrc"    2>/dev/null || true; fi

# Belt-and-suspenders: make sure the common pnpm/node install dirs are on PATH
# even if the profiles above didn't add them.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "[run-workers] $(date '+%Y-%m-%dT%H:%M:%S%z') starting serve in $REPO (pnpm=$(command -v pnpm || echo MISSING))"

exec pnpm --filter @cortex/workers serve
