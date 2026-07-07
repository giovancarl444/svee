"""Unit tests for the read-only iMessage bridge. Builds a fixture chat.db that
mirrors the real schema's relevant columns — no macOS or real Messages data
needed — and exercises the pure helpers + the query."""
import os
import sqlite3
import tempfile
import unittest

import bridge


def make_attributed_body(text: str) -> bytes:
    """Craft a typedstream-ish blob shaped like a real attributedBody: the text is
    a length-prefixed UTF-8 run right after the NSString marker + '+'."""
    raw = text.encode("utf-8")
    marker = b"streamtyped\x81\xe8\x03\x84\x01@NSString\x01\x94\x84\x01+"
    if len(raw) < 0x81:
        length = bytes([len(raw)])
    else:
        length = b"\x81" + len(raw).to_bytes(2, "little")
    return marker + length + raw


class HelperTests(unittest.TestCase):
    def test_apple_time_nanoseconds(self):
        # Modern macOS stores nanoseconds since 2001. 7e17 ns = 7e8 s -> 1678307200 epoch.
        self.assertEqual(bridge.apple_time_to_epoch(700_000_000_000_000_000), 1678307200)

    def test_apple_time_legacy_seconds(self):
        # Older macOS stored seconds since 2001 — same instant, same epoch result.
        self.assertEqual(bridge.apple_time_to_epoch(700_000_000), 1678307200)

    def test_apple_time_zero(self):
        self.assertEqual(bridge.apple_time_to_epoch(0), 0)

    def test_decode_short_attributed_body(self):
        self.assertEqual(
            bridge.decode_attributed_body(make_attributed_body("hey are you around?")),
            "hey are you around?",
        )

    def test_decode_long_attributed_body(self):
        long_text = "x" * 300  # exercises the 0x81 two-byte length path
        self.assertEqual(bridge.decode_attributed_body(make_attributed_body(long_text)), long_text)

    def test_decode_empty(self):
        self.assertEqual(bridge.decode_attributed_body(b""), "")

    def test_message_text_prefers_plain_column(self):
        self.assertEqual(bridge.message_text("plain", make_attributed_body("blob")), "plain")
        self.assertEqual(bridge.message_text(None, make_attributed_body("blob")), "blob")


class QueryTests(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = sqlite3.connect(self.path)
        conn.executescript(
            """
            CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
            CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, guid TEXT);
            CREATE TABLE message (
              ROWID INTEGER PRIMARY KEY, guid TEXT, text TEXT, attributedBody BLOB,
              handle_id INTEGER, date INTEGER, is_from_me INTEGER, service TEXT
            );
            CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
            """
        )
        conn.execute("INSERT INTO handle (ROWID, id) VALUES (1, '+15551234567')")
        conn.execute("INSERT INTO chat (ROWID, guid) VALUES (1, 'iMessage;-;+15551234567')")
        # 1: plain-text received message, in a chat (date in modern nanoseconds)
        conn.execute(
            "INSERT INTO message VALUES (10,'g-plain','see you at 6',NULL,1,700000000000000000,0,'iMessage')"
        )
        conn.execute("INSERT INTO chat_message_join VALUES (1, 10)")
        # 2: attributedBody-only received message, no chat row (chatId falls back to handle)
        conn.execute(
            "INSERT INTO message VALUES (11,'g-attr',NULL,?,1,2000000000,0,'iMessage')",
            (make_attributed_body("sent from newer macOS"),),
        )
        # 3: a message the operator SENT — must be excluded (read-only, inbound only)
        conn.execute("INSERT INTO message VALUES (12,'g-me','my reply',NULL,1,3000000000,1,'iMessage')")
        # 4: empty/attachment-only received message — skipped
        conn.execute("INSERT INTO message VALUES (13,'g-empty',NULL,NULL,1,4000000000,0,'iMessage')")
        conn.commit()
        conn.close()

    def tearDown(self):
        os.remove(self.path)

    def test_query_returns_only_received_text_messages(self):
        conn = bridge.open_db(self.path)
        rows = bridge.query_messages(conn, since=0, limit=200)
        conn.close()

        self.assertEqual([r["id"] for r in rows], ["g-plain", "g-attr"])  # sent + empty excluded

        plain = rows[0]
        self.assertEqual(plain["text"], "see you at 6")
        self.assertEqual(plain["handle"], "+15551234567")
        self.assertEqual(plain["chatId"], "iMessage;-;+15551234567")
        self.assertEqual(plain["timestamp"], 1678307200)

        attr = rows[1]
        self.assertEqual(attr["text"], "sent from newer macOS")
        self.assertEqual(attr["chatId"], "+15551234567")  # no chat row → handle fallback

    def test_since_cursor_advances(self):
        conn = bridge.open_db(self.path)
        rows = bridge.query_messages(conn, since=10, limit=200)
        conn.close()
        self.assertEqual([r["id"] for r in rows], ["g-attr"])  # only ROWID > 10


if __name__ == "__main__":
    unittest.main()
