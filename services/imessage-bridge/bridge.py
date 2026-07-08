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
import glob
import json
import os
import re
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# Seconds between the Unix epoch (1970-01-01) and Apple's Core Data epoch (2001-01-01).
APPLE_EPOCH_OFFSET = 978307200

DEFAULT_DB = os.path.expanduser("~/Library/Messages/chat.db")

# macOS Contacts (AddressBook) lives here. Records may sit in a per-source DB under
# Sources/*/ and/or in a top-level DB. We read every one we find, strictly read-only.
ADDRESSBOOK_DIR = os.path.expanduser("~/Library/Application Support/AddressBook")
ADDRESSBOOK_DB_GLOBS = (
    os.path.join(ADDRESSBOOK_DIR, "AddressBook-v22.abcddb"),
    os.path.join(ADDRESSBOOK_DIR, "Sources", "*", "AddressBook-v22.abcddb"),
)

# How many trailing phone digits to key on. Long enough to stay unique for a
# personal contact list, short enough that +46 70 123 45 67 and 070 123 45 67
# (or +1 (555) 123-4567 and 5551234567) collapse to the same key.
PHONE_KEY_LEN = 8


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


# --- Contact-name enrichment (AddressBook, strictly read-only) ----------------

_ORG = "ZORGANIZATION"

CONTACT_NAME_SQL = f"""
SELECT
  p.ZFULLNUMBER            AS phone,
  NULL                     AS email,
  r.ZFIRSTNAME             AS first,
  r.ZLASTNAME              AS last,
  r.{_ORG}                 AS org
FROM ZABCDPHONENUMBER p
JOIN ZABCDRECORD r ON r.Z_PK = p.ZOWNER
UNION ALL
SELECT
  NULL                     AS phone,
  e.ZADDRESS               AS email,
  r.ZFIRSTNAME             AS first,
  r.ZLASTNAME              AS last,
  r.{_ORG}                 AS org
FROM ZABCDEMAILADDRESS e
JOIN ZABCDRECORD r ON r.Z_PK = e.ZOWNER
"""


def normalize_phone_key(value):
    """Reduce a phone number to a comparable key: keep digits only and take the last
    PHONE_KEY_LEN of them, so +46 70 123 45 67 and 070-123 45 67 (or +1 555-123-4567
    and 5551234567) all map to the same key. Returns '' when there aren't enough
    digits (e.g. a short code) — those simply won't match, which is the safe default."""
    digits = re.sub(r"\D", "", value or "")
    if len(digits) < PHONE_KEY_LEN:
        return ""
    return digits[-PHONE_KEY_LEN:]


def normalize_email_key(value):
    """Emails match case-insensitively on the exact address."""
    return (value or "").strip().lower()


def contact_display_name(first, last, org):
    """Compose a human name from a Contacts record: 'First Last', falling back to
    whichever of first/last exists, then the organization. '' if the record is empty."""
    name = " ".join(part for part in (first, last) if part and part.strip()).strip()
    if name:
        return name
    if org and org.strip():
        return org.strip()
    return ""


def _addressbook_db_paths():
    """Every AddressBook SQLite DB on this Mac (per-source and/or top-level)."""
    paths = []
    for pattern in ADDRESSBOOK_DB_GLOBS:
        paths.extend(glob.glob(pattern))
    return paths


def _load_names_from_db(path, phone_map, email_map):
    """Merge one AddressBook DB's phone/email → name rows into the maps. Opened
    read-only + immutable so we never lock or touch Contacts. Best-effort: any error
    (locked, schema drift, missing table) is swallowed so enrichment can't break the
    bridge or a single bad source can't sink the others."""
    conn = None
    try:
        uri = f"file:{path}?mode=ro&immutable=1"
        conn = sqlite3.connect(uri, uri=True)
        conn.row_factory = sqlite3.Row
        for row in conn.execute(CONTACT_NAME_SQL):
            name = contact_display_name(row["first"], row["last"], row["org"])
            if not name:
                continue
            if row["phone"]:
                key = normalize_phone_key(row["phone"])
                if key:
                    phone_map.setdefault(key, name)
            elif row["email"]:
                key = normalize_email_key(row["email"])
                if key:
                    email_map.setdefault(key, name)
    except Exception:  # noqa: BLE001 — never let a missing/locked AddressBook break us
        pass
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


def build_contact_index(paths=None):
    """Build a (phone_map, email_map) name index from the AddressBook DB(s). Cached
    once at startup by the caller. Wrapped so a missing/locked Contacts DB yields
    empty maps rather than an error — enrichment is a nicety, never a hard dependency."""
    phone_map, email_map = {}, {}
    try:
        for path in (paths if paths is not None else _addressbook_db_paths()):
            _load_names_from_db(path, phone_map, email_map)
    except Exception:  # noqa: BLE001
        pass
    return phone_map, email_map


def resolve_display_name(handle, contact_index):
    """Look up a chat.db handle (a phone number or an email) in the contact index.
    Returns the contact's name, or '' when unknown (preserving current behavior)."""
    if not handle or not contact_index:
        return ""
    phone_map, email_map = contact_index
    if "@" in handle:
        return email_map.get(normalize_email_key(handle), "")
    key = normalize_phone_key(handle)
    if key:
        name = phone_map.get(key)
        if name:
            return name
    # Some handles are plain emails without '@'? No — but a short code / non-phone
    # handle can still match an email entry verbatim, so try that as a last resort.
    return email_map.get(normalize_email_key(handle), "")


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


def query_messages(conn, since, limit, contact_index=None):
    """Received messages with ROWID > since, oldest first. Rows without a resolvable
    handle or text (system rows, attachment-only) are skipped. `contact_index` is the
    cached (phone_map, email_map) from AddressBook; when a handle matches, its name is
    used as displayName, else '' (unchanged behavior)."""
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
                "displayName": resolve_display_name(handle, contact_index),
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
    contact_index = None  # cached (phone_map, email_map) from AddressBook, built at startup

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
                messages = query_messages(conn, since, limit, self.contact_index)
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
    # Build the contact-name index once at startup (cached for the process lifetime).
    # Never fatal: a missing/locked AddressBook just yields empty maps and blank names.
    Handler.contact_index = build_contact_index()
    contact_count = len(Handler.contact_index[0]) + len(Handler.contact_index[1])
    host = os.environ.get("IMESSAGE_BRIDGE_HOST", "127.0.0.1")
    port = int(os.environ.get("IMESSAGE_BRIDGE_PORT", "8090"))
    print(
        f"cortex imessage-bridge (read-only) listening on {host}:{port}, "
        f"db={Handler.db_path}, contacts_indexed={contact_count}"
    )
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
