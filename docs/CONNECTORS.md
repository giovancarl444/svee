# Connecting real sources

CORTEX is read-only on every source. This is the runbook for wiring a real
inbox/account and — importantly — debugging the first connect, which is where the
friction always is. All credentials go in `.env` (never the repo).

**Golden rule: after setting any source's env, run the preflight before syncing.**

```bash
pnpm --filter @cortex/workers doctor
```

`doctor` registers every configured source and probes each one **read-only** (auth
+ connectivity, no ingestion). You want every row `[OK]`. It exits non-zero if any
configured source is unhealthy, so you can gate a sync on it. Only once it's green:

```bash
pnpm --filter @cortex/workers sync        # ingest → triage → escalate → loops
```

Start with the **smallest useful slice** (a recent window / one label), eyeball the
Priority + Inbox views, then widen.

---

## Gmail + Google Calendar

One Google OAuth client covers both (scopes `gmail.readonly` + `calendar.readonly`).

1. [console.cloud.google.com](https://console.cloud.google.com) → new project →
   **Enable APIs**: "Gmail API" and "Google Calendar API".
2. **OAuth consent screen** → External. **Set it to "In production", not "Testing."**
3. **Credentials → Create OAuth client ID → Web application**, add the redirect URI
   **exactly** matching `GMAIL_REDIRECT_URI` (default `http://localhost:3000/oauth/gmail/callback`).
4. Put `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` in `.env`, then:
   `pnpm --filter @cortex/workers gmail:auth` → open the URL, approve, paste the
   `code` back → it prints `GMAIL_REFRESH_TOKEN`. Put that in `.env`.

Common failures:
- **Token stops working after 7 days** → the consent screen is still in "Testing".
  Set it to "In production" and re-run `gmail:auth`.
- **`redirect_uri_mismatch`** → the URI in the console must match `GMAIL_REDIRECT_URI`
  character-for-character (scheme, port, trailing slash).
- **403 `accessNotConfigured` / `SERVICE_DISABLED`** → the Gmail/Calendar API isn't
  enabled on the project (step 1).
- **`invalid_grant` on refresh** → the refresh token was revoked or the app is back in
  Testing; re-run `gmail:auth`.

## Outlook.com / Microsoft 365 (IMAP over OAuth)

Basic-auth / app passwords no longer work for Outlook IMAP (2026 cutoff) — it's OAuth.

1. [portal.azure.com](https://portal.azure.com) → **App registrations** → New.
   Supported account types must **include personal Microsoft accounts**.
2. Add a **Web** redirect URI matching `OUTLOOK_REDIRECT_URI`
   (default `http://localhost:3000/oauth/outlook/callback`). Optionally add a client
   secret (confidential client) — set `OUTLOOK_CLIENT_SECRET` if you do.
3. Fill `OUTLOOK_CLIENT_ID` (+ secret), then
   `pnpm --filter @cortex/workers outlook:auth` → approve → paste code →
   set `OUTLOOK_REFRESH_TOKEN` and `OUTLOOK_USER` (your address).

Common failures:
- **No refresh token returned** → the `offline_access` scope wasn't granted (the auth
  flow requests it; re-run and approve fully).
- **`AADSTS700016` / app not found** → wrong tenant. Personal accounts use
  `OUTLOOK_TENANT=common` (default) or `consumers`.
- **`unauthorized_client`** → the app doesn't allow personal accounts (step 1) or the
  redirect URI type isn't "Web".
- If both `OUTLOOK_*` and `IMAP_*` are set, CORTEX uses Outlook for the single IMAP
  slot and logs that it's ignoring `IMAP_*`.

## Generic IMAP (Fastmail, Yahoo, self-hosted, …)

Set `IMAP_HOST` / `IMAP_PORT` (993) / `IMAP_USER` / `IMAP_PASSWORD`. Use an
**app-specific password** where the provider requires one for 2FA accounts. Not for
Outlook.com — use the OAuth block above.

Common failures:
- **`AUTHENTICATIONFAILED`** → wrong password, or the provider needs an app password.
- **Connection timeout** → wrong host/port, or IMAP access disabled in the provider's
  settings.

## WhatsApp (read-only sidecar, burner number)

The isolated whatsmeow bridge; pairing risks a ban, so use a burner. See
`docs/WHATSAPP.md`. Set `WHATSAPP_BRIDGE_URL` / `WHATSAPP_BRIDGE_TOKEN`; the bridge
must be reachable from the workers. `doctor` shows `authValid:false` until the QR is
paired.

## iMessage (read-only macOS sidecar)

Runs on your Mac. Grant **Full Disk Access** to whatever runs `bridge.py`, start it
with a shared `IMESSAGE_BRIDGE_TOKEN`, and set `IMESSAGE_BRIDGE_URL` /
`IMESSAGE_BRIDGE_TOKEN` on the CORTEX side (reach it over Tailscale/localhost). See
`services/imessage-bridge/README.md`. `doctor`'s `dbReadable:false` means Full Disk
Access is missing or the path is wrong.
