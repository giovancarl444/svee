#!/usr/bin/env python3
# =============================================================================
# CORTEX iMessage bridge — READ-ONLY.
#
# Runs on the operator's Mac (that is where ~/Library/Messages/chat.db lives).
# It exposes *received* iMessages/SMS over a small, token-authed HTTP API that
# the CORTEX iMessage adapter polls — mirroring the WhatsApp bridge. It NEVER
# sends and NEVER writes: the database is opened read-only + immutable, and only
# incoming rows (is_from_me = 0) are surfaced.
#
# Requires Full Disk Access for whatever runs this (Terminal / the python
# binary), because ~/Library/Messages is protected by macOS TCC.
#
# Stdlib only — no pip installs. Run:
#   IMESSAGE_BRIDGE_TOKEN=... python3 bridge.py
# Then expose it to CORTEX over Tailscale / localhost as IMESSAGE_BRIDGE_URL.
# =============================================================================
import json
import os
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# Seconds between the Unix epoch (1970-01-01) and Apple's Core Data epoch (2001-01-01).
APPLE_EPOCH_OFFSET = 978307200

DEFAULT_DB = os.path.expanduser("~/Library/Messages/chat.db")


def apple_time_to_epoch(date):
    """chat.db `message.date`: nanoseconds since 2001 on modern macOS, seconds on
    older builds. Normalize either to Unix epoch seconds."""
    if not date:
        return 0
    # A nanosecond timestamp for any recent year is ~1e17-1e18; seconds ~1e8-1e9.
    seconds = date / 1_000_000_000 if date > 100_000_000_000 else date
    return int(seconds + APPLE_EPOCH_OFFSET)


def decode_attributed_body(blob):
    """Best-effort text extraction from the `attributedBody` typedstream blob, used
    when the plain `text` column is NULL (common on newer macOS). The message text
    is stored right after the NSString class marker as a length-prefixed UTF-8 run."""
    if not blob:
        return ""
    i = blob.find(b"NSString")
    if i == -1:
        return ""
    plus = blob.find(b"+", i)
    if plus == -1:
        return ""
    i = plus + 1
    if i >= len(blob):
        return ""
    length = blob[i]
    i += 1
    if length == 0x81:  # marker: a 2-byte little-endian length follows
        if i + 2 > len(blob):
            return ""
        length = int.from_bytes(blob[i : i + 2], "little")
        i += 2
    return blob[i : i + length].decode("utf-8", errors="replace")


def message_text(text, attributed_body):
    """Prefer the plain text column; fall back to the attributedBody blob."""
    if text:
        return text
    return decode_attributed_body(attributed_body)


MESSAGES_SQL = """
SELECT
  m.ROWID            AS seq,
  m.guid             AS id,
  h.id               AS handle,
  m.date             AS date,
  m.text             AS text,
  m.attributedBody   AS attributed_body,
  m.service          AS service,
  c.guid             AS chat_guid
FROM message m
LEFT JOIN handle h ON h.ROWID = m.handle_id
LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
LEFT JOIN chat c ON c.ROWID = cmj.chat_id
WHERE m.is_from_me = 0
  AND m.ROWID > ?
ORDER BY m.ROWID ASC
LIMIT ?
"""


def query_messages(conn, since, limit):
    """Received messages with ROWID > since, oldest first. Rows without a resolvable
    handle or text (system rows, attachment-only) are skipped."""
    out = []
    for row in conn.execute(MESSAGES_SQL, (since, limit)):
        handle = row["handle"]
        if not handle:
            continue
        text = message_text(row["text"], row["attributed_body"])
        if not text:
            continue
        out.append(
            {
                "seq": row["seq"],
                "id": row["id"],
                "chatId": row["chat_guid"] or handle,
                "handle": handle,
                "displayName": "",  # contact names live in AddressBook, not chat.db
                "timestamp": apple_time_to_epoch(row["date"]),
                "text": text,
                "service": row["service"] or "iMessage",
            }
        )
    return out


def open_db(path):
    """Open chat.db strictly read-only + immutable, so we never lock or mutate the
    live database while Messages.app has it open."""
    uri = f"file:{path}?mode=ro&immutable=1"
    conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


class Handler(BaseHTTPRequestHandler):
    token = ""
    db_path = DEFAULT_DB

    def log_message(self, *args):  # silence default stderr access logs
        pass

    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authed(self):
        return self.headers.get("authorization", "") == f"Bearer {self.token}"

    def do_GET(self):
        route = urlparse(self.path)
        if route.path == "/health":
            return self._send(200, {"ok": True})

        if not self._authed():
            return self._send(401, {"error": "unauthorized"})

        if route.path == "/status":
            try:
                conn = open_db(self.db_path)
                conn.execute("SELECT 1 FROM message LIMIT 1")
                conn.close()
                return self._send(200, {"connected": True, "dbReadable": True})
            except Exception as err:  # noqa: BLE001
                return self._send(200, {"connected": True, "dbReadable": False, "account": str(err)})

        if route.path == "/messages":
            q = parse_qs(route.query)
            since = int(q.get("since", ["0"])[0])
            limit = min(int(q.get("limit", ["200"])[0]), 500)
            try:
                conn = open_db(self.db_path)
                messages = query_messages(conn, since, limit)
                conn.close()
                return self._send(200, {"messages": messages})
            except Exception as err:  # noqa: BLE001
                return self._send(500, {"error": str(err)})

        return self._send(404, {"error": "not found"})


def main():
    token = os.environ.get("IMESSAGE_BRIDGE_TOKEN")
    if not token:
        print("IMESSAGE_BRIDGE_TOKEN is required (a shared secret CORTEX sends as a Bearer token).", file=sys.stderr)
        sys.exit(1)
    Handler.token = token
    Handler.db_path = os.environ.get("IMESSAGE_DB_PATH", DEFAULT_DB)
    host = os.environ.get("IMESSAGE_BRIDGE_HOST", "127.0.0.1")
    port = int(os.environ.get("IMESSAGE_BRIDGE_PORT", "8090"))
    print(f"cortex imessage-bridge (read-only) listening on {host}:{port}, db={Handler.db_path}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
