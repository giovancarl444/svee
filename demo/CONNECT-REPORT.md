# CORTEX — connecting real sources: what's automated vs. what only you can do

**Goal of this pass:** make connecting your real inboxes take the least possible operator time. The guiding rule: *you should only ever do the things that, by security design, only you can do — grant access to your own accounts. Everything else is automated.*

This report contains **zero real message content and zero secrets** (there is none yet — nothing is connected). It documents the automation added and the exact, minimal human checklist.

---

## What is now automated (you do none of this)

- **No more copy-pasting the OAuth `code`.** `gmail:auth` / `outlook:auth` now run a **local loopback listener**: after you click "Allow" in your browser, CORTEX captures the redirect `code` on `http://127.0.0.1:<free-port>` automatically, exchanges it for a refresh token, and writes it **straight into `.env`** — you copy nothing. (`apps/workers/src/oauth-loopback.ts`, `env-file.ts`; manual paste remains as `--manual`.)
- **The token never crosses your clipboard or this transcript.** It's written to `.env` (gitignored) and never printed (`setEnvVar` — value not echoed).
- **A free port is chosen automatically** (OS-assigned), so a Google **"Desktop app"** client needs no redirect URI pre-registered.
- **Preflight is one command.** `pnpm --filter @cortex/workers run doctor` probes each configured source **read-only** (auth + connectivity, no ingestion) and tells you exactly which one is unhealthy and why — turning a confusing failed sync into a clear per-source diagnostic.
- **The pipeline is armed** on the free local model (`qwen2.5:7b-instruct`, $0). The instant a source connects, `sync` → triage → escalate → loops → `synthesize` produces a real brief.

> **Runbook fix found & applied:** the documented `pnpm --filter @cortex/workers doctor` collided with pnpm's **built-in** `doctor` command (it never ran the script). Corrected to `… run doctor` throughout `docs/CONNECTORS.md`.

---

## The irreducible human steps (batched — do them in one ~15-min sitting)

Each of these is the security boundary working as intended: **only the account owner can authorize access to their own mailbox.** That's the point of the design — you *want* to be the only one who can grant it. I never see your password or 2FA; I only ever receive the post-consent authorization code.

> **First, one line:** set `CORTEX_DEMO=0` in `.env` (the synthetic demo is exclusive; turning it off lets real adapters wire).

### 1 · Gmail + Google Calendar — ~8 min (one client covers both)
1. **you** — [console.cloud.google.com](https://console.cloud.google.com): new project → **Enable APIs**: "Gmail API" + "Google Calendar API".
2. **you** — **OAuth consent screen** → External → **publish to "In production"** (not "Testing", or Google kills the token in 7 days).
3. **you** — **Credentials → Create OAuth client → "Desktop app"** (best for loopback auto-capture; no redirect URI to enter).
4. **you** — paste `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` into `.env` (the only values only you can retrieve).
5. **you** — run `pnpm --filter @cortex/workers connect:gmail`, click **Allow** in the browser that opens.
6. **me** — capture the code, write `GMAIL_REFRESH_TOKEN`, `run doctor` → green, `sync` a small slice, `synthesize`, and show you the real Priority + Tomorrow Plan.

### 2 · Outlook.com / Microsoft 365 — ~8 min
1. **you** — [portal.azure.com](https://portal.azure.com) → **App registrations → New**; supported accounts **must include personal Microsoft accounts**.
2. **you** — **Authentication → Add platform → "Mobile and desktop applications"**, redirect `http://localhost` (loopback). (Optional: add a client secret.)
3. **you** — paste `OUTLOOK_CLIENT_ID` (+ secret if made) into `.env`.
4. **you** — run `pnpm --filter @cortex/workers connect:outlook`, click **Allow**, type your Outlook address once.
5. **me** — the rest (token, `doctor`, slice, brief).

### 3 · iMessage — ~2 min (almost entirely me; you're on a Mac)
1. **me** — start `services/imessage-bridge/bridge.py`, generate + wire `IMESSAGE_BRIDGE_TOKEN` / `IMESSAGE_BRIDGE_URL`.
2. **you** — grant **Full Disk Access** to the process running the bridge — one macOS System Settings toggle (I'll open the exact pane).
3. **me** — `run doctor` → slice → brief.

### 4 · WhatsApp — optional (offer, not a push)
Burner number + QR scan; more involved and ban-risky. Skip unless you want it.

---

## After ANY source connects (all me)

```bash
pnpm --filter @cortex/workers run doctor   # must be green for the source
pnpm --filter @cortex/workers sync         # smallest useful slice first
pnpm --filter @cortex/workers synthesize   # your first REAL Tomorrow Plan
```

I ingest the **smallest useful slice first** (recent window / one label), we eyeball it together, then widen only if you want. Real data is shown to you, never committed or screenshotted.

## Adding the next source later (~2 min)
Put its creds in `.env` → `run doctor` (must be green) → `sync`. That's it. The adapters self-register from env; a source with no creds is simply skipped.

---

## The split, honestly

| Step | You | Me |
|---|---|---|
| Create the OAuth client / app registration | ✅ (only you can) | pre-open the exact URLs, walk you click-by-click |
| Paste CLIENT_ID / SECRET into `.env` | ✅ (only you can retrieve them) | — |
| Click **Allow** in your browser | ✅ (only you can consent) | open the consent page for you |
| macOS Full Disk Access (iMessage) | ✅ (a system dialog only you can accept) | open the exact settings pane |
| Capture the code, mint + store the token | — | ✅ automated (loopback) |
| doctor / sync / synthesize / show the brief | — | ✅ |

Everything on the right is done. The left column is four short clicks and two paste-ins — the security boundary doing its job.
