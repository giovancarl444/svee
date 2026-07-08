# WhatsApp — read-only, isolated, ban-risk-aware

Read [`services/whatsapp-bridge/main.go`](../services/whatsapp-bridge/main.go) and
spec §7 first. The short version:

- **No official API exists** for reading your own personal WhatsApp. This uses the
  unofficial multi-device client [whatsmeow](https://github.com/tulir/whatsmeow)
  (`go.mau.fi/whatsmeow`), which **violates WhatsApp ToS and carries
  non-deterministic ban risk**.
- Ban risk is driven by **outbound** behaviour. This module is **read-only** — it
  ingests incoming messages and **sends nothing**. There is deliberately no send
  path. That's the lowest-risk pattern, not zero risk.
- Use a **burner / secondary number**, not your primary. The number is trivially
  swappable (wipe the session volume and re-scan).
- The bridge is **isolated** in its own container. Kill it and the rest of CORTEX
  is unaffected — you lose one connector, not the brain.

## Setup

1. Choose a token and set it in `.env`:
   ```
   WHATSAPP_BRIDGE_TOKEN=$(openssl rand -base64 32)
   ```
2. Start the bridge alongside the workers:
   ```
   docker compose --profile workers --profile whatsapp up -d
   ```
3. Link the device (one time). Read the QR from the bridge logs and scan it in
   WhatsApp → **Linked Devices** on your burner phone:
   ```
   docker compose logs -f wa-bridge
   ```
4. Once linked, incoming messages flow into CORTEX on the next `sync`. The bridge
   port is **never published** — only the workers reach it over the compose network.

## Architecture

```
 WhatsApp servers ──(whatsmeow, linked device)──▶  wa-bridge (Go, read-only)
                                                     │  buffers incoming msgs in sqlite
                                                     ▼  GET /messages?since=<seq>  (Bearer)
                                          @cortex/whatsapp adapter ──▶ normalize ──▶ items
```

The bridge exposes only `GET /health`, `/status`, `/qr`, and `/messages` (the last
three Bearer-authed). Senders are stored as `wa_jid` handles, so a person's
WhatsApp identity can be [merged](../packages/db/src/repo.ts) with their email.

## Supply chain (non-negotiable, spec §7 #4)

Canonical repos only (`go.mau.fi/whatsmeow` = `github.com/tulir/whatsmeow`), pinned
via `go.sum`. A malicious Baileys fork (`lotusbail`) once stole auth tokens — treat
any package promising "undetectable" anything as malware.
