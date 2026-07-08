#!/usr/bin/env bash
# =============================================================================
# CORTEX — install/uninstall the macOS LaunchAgents that keep the always-on
# scheduler (`pnpm --filter @cortex/workers serve`) and the read-only iMessage
# bridge (services/imessage-bridge/bridge.py) running across logout/reboot.
#
#   scripts/install-service.sh [install|uninstall|status]   (default: install)
#
# What it does (install):
#   * substitutes this repo's real path + your $HOME into the .plist.template
#     files under scripts/launchd/,
#   * writes the results to ~/Library/LaunchAgents/,
#   * bootstraps (loads) them into your GUI launchd domain so they run now and
#     at every login/reboot.
#
# Idempotent: safe to re-run; it boots out any existing copy before re-loading.
# No secret is ever written here — the bridge wrapper reads IMESSAGE_BRIDGE_TOKEN
# from .env at runtime; the workers app loads .env itself (loadLocalEnv).
#
# It does NOT modify any application code. New files only.
# =============================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$REPO/scripts/launchd"
AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$REPO/demo/logs"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"

LABELS=(com.cortex.workers com.cortex.bridge)

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
info() { printf '  %s\n' "$*"; }

# --- launchctl seam: bootstrap/bootout on modern macOS, fall back to load/unload.
lc_load() {  # $1 = plist path
  if launchctl bootstrap "$DOMAIN" "$1" 2>/dev/null; then return 0; fi
  # Already loaded, or older macOS — fall back to legacy load.
  launchctl load -w "$1" 2>/dev/null || true
}
lc_unload() {  # $1 = label  $2 = plist path (may not exist)
  launchctl bootout "$DOMAIN/$1" 2>/dev/null || true
  [ -n "${2:-}" ] && [ -f "$2" ] && launchctl unload -w "$2" 2>/dev/null || true
}
lc_kickstart() {  # $1 = label — force a start now if it isn't running
  launchctl kickstart -k "$DOMAIN/$1" 2>/dev/null || true
}

running_serve_or_bridge() {
  # Best-effort detection of a manually-launched scheduler/bridge (not our agents).
  pgrep -f "@cortex/workers serve" >/dev/null 2>&1 && echo "serve"
  pgrep -f "imessage-bridge/bridge.py" >/dev/null 2>&1 && echo "bridge"
}

install_agents() {
  bold "Installing CORTEX LaunchAgents (repo: $REPO)"

  # Preflight: warn about anything already running by hand, to avoid two schedulers.
  local dupes; dupes="$(running_serve_or_bridge || true)"
  if [ -n "$dupes" ]; then
    warn "A manually-running process was detected: [$(echo "$dupes" | tr '\n' ' ')]"
    warn "STOP it first (Ctrl-C in its terminal, or kill it) so you don't run TWO"
    warn "schedulers/bridges at once — two schedulers double every scheduled run."
    warn "Re-run this script once it's stopped. Continuing will load the agent anyway."
    printf '  Continue and load the agents now? [y/N] '
    read -r ans
    case "$ans" in y|Y|yes|YES) : ;; *) info "Aborted. Nothing changed."; exit 1 ;; esac
  fi

  mkdir -p "$AGENTS_DIR" "$LOG_DIR"

  # Make sure wrappers are executable (they must be, for launchd to exec them).
  chmod +x "$TEMPLATE_DIR/run-workers.sh" "$TEMPLATE_DIR/run-bridge.sh"

  for label in "${LABELS[@]}"; do
    local tmpl="$TEMPLATE_DIR/$label.plist.template"
    local dest="$AGENTS_DIR/$label.plist"
    [ -f "$tmpl" ] || { warn "Missing template: $tmpl"; exit 1; }

    # Boot out any previously-installed copy so re-runs are clean/idempotent.
    lc_unload "$label" "$dest"

    # Substitute real paths. Use a non-slash sed delimiter since paths contain /.
    sed -e "s#__CORTEX_REPO__#$REPO#g" \
        -e "s#__CORTEX_HOME__#$HOME#g" \
        "$tmpl" > "$dest"
    info "wrote $dest"

    lc_load "$dest"
    lc_kickstart "$label"
    info "loaded $DOMAIN/$label"
  done

  bold "Done."
  info "Logs:    $LOG_DIR/{workers,bridge}.{out,err}.log"
  info "Status:  scripts/install-service.sh status"
  info "Remove:  scripts/install-service.sh uninstall"
  echo
  warn "iMessage bridge needs Full Disk Access to read ~/Library/Messages/chat.db."
  warn "Grant it in System Settings > Privacy & Security > Full Disk Access to"
  warn "  /usr/bin/python3  (or your python3) AND  /bin/zsh  (the wrapper shell),"
  warn "then: scripts/install-service.sh uninstall && scripts/install-service.sh install"
  warn "The scheduler also needs docker Postgres (:5432) + Ollama (:11434) reachable."
}

uninstall_agents() {
  bold "Uninstalling CORTEX LaunchAgents"
  for label in "${LABELS[@]}"; do
    local dest="$AGENTS_DIR/$label.plist"
    lc_unload "$label" "$dest"
    if [ -f "$dest" ]; then rm -f "$dest"; info "removed $dest"; else info "not installed: $label"; fi
  done
  bold "Done. Both agents stopped and unloaded."
}

status_agents() {
  bold "CORTEX LaunchAgent status ($DOMAIN)"
  for label in "${LABELS[@]}"; do
    local dest="$AGENTS_DIR/$label.plist"
    if launchctl print "$DOMAIN/$label" >/dev/null 2>&1; then
      local pid state
      pid="$(launchctl print "$DOMAIN/$label" 2>/dev/null | awk -F' = ' '/pid =/{print $2; exit}')"
      state="$(launchctl print "$DOMAIN/$label" 2>/dev/null | awk -F' = ' '/state =/{print $2; exit}')"
      info "$label: LOADED  pid=${pid:-none}  state=${state:-?}  plist=$([ -f "$dest" ] && echo yes || echo MISSING)"
    else
      info "$label: not loaded  plist=$([ -f "$dest" ] && echo present || echo absent)"
    fi
  done
  local dupes; dupes="$(running_serve_or_bridge || true)"
  [ -n "$dupes" ] && warn "Also running by hand (possible duplicate): $(echo "$dupes" | tr '\n' ' ')"
}

case "${1:-install}" in
  install)   install_agents ;;
  uninstall|remove|stop) uninstall_agents ;;
  status)    status_agents ;;
  *) echo "usage: $0 [install|uninstall|status]" >&2; exit 2 ;;
esac
