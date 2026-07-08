# CORTEX iMessage bridge (read-only)

A tiny, stdlib-only Python sidecar that exposes **received** iMessages/SMS from
your Mac's `~/Library/Messages/chat.db` to CORTEX over a token-authed HTTP API.
It mirrors the WhatsApp bridge: CORTEX only ever **reads**, and this process is
the isolated thing that touches the local Messages database.

It **never sends** and **never writes** — the database is opened read-only +
immutable, and only incoming rows (`is_from_me = 0`) are surfaced.

## Why a sidecar

`chat.db` lives on your Mac and is protected by macOS TCC (Full Disk Access).
The CORTEX workers usually run elsewhere (a VPS/container). So this bridge runs
on the Mac and CORTEX polls it — typically over your private Tailscale network.

## Run it

1. **Grant Full Disk Access** to the program that will run this (System Settings
   → Privacy & Security → Full Disk Access → add Terminal, or the `python3`
   binary you use). Without it, opening `chat.db` fails with a permissions error.

2. Start the bridge (Python 3 ships with macOS — no `pip install` needed):

   ```bash
   export IMESSAGE_BRIDGE_TOKEN="$(openssl rand -base64 32)"   # shared secret
   python3 bridge.py
   ```

   It listens on `127.0.0.1:8090` by default. Override with `IMESSAGE_BRIDGE_HOST`
   / `IMESSAGE_BRIDGE_PORT`, and point at a copy of the DB with `IMESSAGE_DB_PATH`.

3. Make it reachable to CORTEX (e.g. Tailscale) and set on the CORTEX side:

   ```bash
   IMESSAGE_BRIDGE_URL=http://<mac-tailscale-name>:8090
   IMESSAGE_BRIDGE_TOKEN=<the same secret>
   ```

## API

| Route                          | Auth   | Returns |
| ------------------------------ | ------ | ------- |
| `GET /health`                  | none   | `{ "ok": true }` |
| `GET /status`                  | Bearer | `{ "connected", "dbReadable" }` |
| `GET /messages?since=&limit=`  | Bearer | `{ "messages": [ … ] }` — received messages with `ROWID > since` |

Each message: `{ seq, id, chatId, handle, displayName, timestamp, text, service }`
(`timestamp` is Unix epoch seconds; `seq` is the `chat.db` ROWID cursor CORTEX
checkpoints on).

## Notes / limitations

- `displayName` is enriched from **macOS Contacts** (AddressBook), strictly
  read-only. At startup the bridge builds a cached handle→name index from
  `~/Library/Application Support/AddressBook/**/AddressBook-v22.abcddb` (opened
  `mode=ro&immutable=1`), matching phone handles on their last digits (so `+46 70…`
  and `070…` collapse) and emails case-insensitively. Unknown handles keep the raw
  phone/email, exactly as before. A missing/locked Contacts DB is non-fatal — names
  just stay blank. This needs the same Full Disk Access as reading `chat.db`.
- Newer macOS often stores message text in the `attributedBody` typedstream blob
  rather than the `text` column; the bridge best-effort-extracts it. Attachment-
  only / reaction rows (no text) are skipped.
- Keep this bound to localhost/Tailscale. The Bearer token is the only guard.

## Test

```bash
python3 -m unittest -v
```

Runs against a fixture `chat.db` — no macOS or real Messages data required.
