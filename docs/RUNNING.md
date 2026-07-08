# Keeping CORTEX running (macOS LaunchAgents)

By default the always-on scheduler and the iMessage bridge run in a terminal and
**die when that terminal closes** (logout, reboot, or just closing the window).

Two per-user **LaunchAgents** fix that — they start both at login and relaunch
them if they crash or after a reboot:

| Agent | Runs | KeepAlive |
| --- | --- | --- |
| `com.cortex.workers` | `pnpm --filter @cortex/workers serve` (the scheduler) | yes |
| `com.cortex.bridge`  | `python3 services/imessage-bridge/bridge.py` (read-only iMessage sidecar) | yes |

Nothing here is a send path — CORTEX stays read-only. The scheduler still loads
`.env` itself (`loadLocalEnv`); the bridge's `IMESSAGE_BRIDGE_TOKEN` is read from
`.env` **at runtime** by a wrapper and is never written into any installed file.

## Enable

```bash
# STOP any manually-running serve/bridge first (Ctrl-C in their terminals) so you
# don't end up with TWO schedulers — two schedulers double every scheduled run.
scripts/install-service.sh          # substitutes paths, installs to
                                    # ~/Library/LaunchAgents, and loads both
```

The installer is **idempotent** — re-run it any time (e.g. after moving the repo
or editing a template) and it re-writes and reloads cleanly. It warns and prompts
if it detects a hand-started `serve`/bridge.

Prerequisites the scheduler needs reachable (it retries every ~30s until they are):

- **docker Postgres** on `127.0.0.1:5432`
- **Ollama** on `127.0.0.1:11434` (or your configured model provider)

## Full Disk Access (bridge only)

`bridge.py` reads `~/Library/Messages/chat.db`, which is TCC-protected. Because
**launchd** starts it, grant **Full Disk Access** to the tools launchd runs — not
to Terminal:

1. System Settings → Privacy & Security → **Full Disk Access**.
2. Add `/bin/zsh` (the wrapper shell) **and** your `python3`
   (`which python3` — e.g. `/usr/bin/python3` or a venv's python3).
3. Re-cycle the bridge so it picks up the grant:
   ```bash
   scripts/install-service.sh uninstall && scripts/install-service.sh install
   ```

`doctor`'s `dbReadable:false` for iMessage means this grant is still missing.

## Status / logs

```bash
scripts/install-service.sh status
tail -f demo/logs/workers.err.log      # scheduler
tail -f demo/logs/bridge.err.log       # bridge
```

(Logs land in `demo/logs/`; `demo/` is already the repo's scratch/output area.)

## Disable

```bash
scripts/install-service.sh uninstall   # boots out + removes both agents
```

## How it's wired (so future-you can debug it)

- The `.plist.template` files under `scripts/launchd/` carry `__CORTEX_REPO__` /
  `__CORTEX_HOME__` placeholders; the installer substitutes the real values and
  writes the result to `~/Library/LaunchAgents/`. **Edit the templates, never the
  installed copies** — re-running the installer overwrites the copies.
- Each agent execs a **wrapper** (`run-workers.sh` / `run-bridge.sh`) instead of a
  binary directly. The wrapper sources your login shell (`~/.zprofile`/`~/.zshrc`)
  so `PATH`, `pnpm`, `node`, and `python3` resolve exactly like an interactive
  terminal — launchd's own environment is otherwise bare.
- `ThrottleInterval` (~30s) + `KeepAlive` mean that if docker/Ollama aren't up
  yet at boot, `serve` exits and launchd waits and retries instead of hot-looping.

See `docs/CONNECTORS.md` for the iMessage bridge connect/token setup itself.
