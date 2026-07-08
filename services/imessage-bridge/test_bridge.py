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


class ContactNormalizationTests(unittest.TestCase):
    def test_phone_key_ignores_formatting(self):
        # Same US number written three ways collapses to one key.
        a = bridge.normalize_phone_key("+1 (555) 123-4567")
        b = bridge.normalize_phone_key("5551234567")
        c = bridge.normalize_phone_key("555.123.4567")
        self.assertTrue(a)
        self.assertEqual(a, b)
        self.assertEqual(b, c)

    def test_phone_key_matches_across_country_code(self):
        # +46 70 123 45 67 (intl) and 070 123 45 67 (local) share the last 8 digits.
        intl = bridge.normalize_phone_key("+46 70 123 45 67")
        local = bridge.normalize_phone_key("070-123 45 67")
        self.assertTrue(intl)
        self.assertEqual(intl, local)

    def test_phone_key_too_short_is_empty(self):
        self.assertEqual(bridge.normalize_phone_key("911"), "")
        self.assertEqual(bridge.normalize_phone_key(""), "")
        self.assertEqual(bridge.normalize_phone_key(None), "")

    def test_email_key_is_lowercased(self):
        self.assertEqual(bridge.normalize_email_key("  Jane.Doe@Example.COM "), "jane.doe@example.com")
        self.assertEqual(bridge.normalize_email_key(None), "")

    def test_contact_display_name_composition(self):
        self.assertEqual(bridge.contact_display_name("Jane", "Doe", None), "Jane Doe")
        self.assertEqual(bridge.contact_display_name("Jane", None, "Acme"), "Jane")
        self.assertEqual(bridge.contact_display_name(None, None, "Acme Inc"), "Acme Inc")
        self.assertEqual(bridge.contact_display_name(None, None, None), "")

    def test_resolve_display_name_none_index(self):
        # No AddressBook loaded → always '' (current behavior preserved).
        self.assertEqual(bridge.resolve_display_name("+15551234567", None), "")

    def test_resolve_display_name_unknown_handle(self):
        index = ({"51234567": "Jane Doe"}, {})
        self.assertEqual(bridge.resolve_display_name("+19998887777", index), "")


def make_addressbook_db(path, phones, emails):
    """Build a minimal AddressBook-v22.abcddb fixture: ZABCDRECORD holding names,
    ZABCDPHONENUMBER / ZABCDEMAILADDRESS pointing back via ZOWNER. Only the columns
    the bridge reads are created — no macOS or real Contacts data needed.
    `phones` / `emails` are lists of (value, first, last, org)."""
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE ZABCDRECORD (
          Z_PK INTEGER PRIMARY KEY, ZFIRSTNAME TEXT, ZLASTNAME TEXT, ZORGANIZATION TEXT
        );
        CREATE TABLE ZABCDPHONENUMBER (
          Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZFULLNUMBER TEXT
        );
        CREATE TABLE ZABCDEMAILADDRESS (
          Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZADDRESS TEXT
        );
        """
    )
    pk = 0
    for value, first, last, org in phones:
        pk += 1
        conn.execute("INSERT INTO ZABCDRECORD VALUES (?,?,?,?)", (pk, first, last, org))
        conn.execute("INSERT INTO ZABCDPHONENUMBER (ZOWNER, ZFULLNUMBER) VALUES (?,?)", (pk, value))
    for value, first, last, org in emails:
        pk += 1
        conn.execute("INSERT INTO ZABCDRECORD VALUES (?,?,?,?)", (pk, first, last, org))
        conn.execute("INSERT INTO ZABCDEMAILADDRESS (ZOWNER, ZADDRESS) VALUES (?,?)", (pk, value))
    conn.commit()
    conn.close()


class ContactIndexTests(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".abcddb")
        os.close(fd)
        make_addressbook_db(
            self.path,
            phones=[
                ("+1 (555) 123-4567", "Jane", "Doe", None),
                ("070-123 45 67", "Sven", "Svensson", None),
                ("", None, None, None),  # empty number → not indexed
            ],
            emails=[
                ("Boss@Example.COM", None, None, "Acme Inc"),
                ("plain@example.com", "Pat", "Plain", None),
            ],
        )

    def tearDown(self):
        os.remove(self.path)

    def test_build_index_and_resolve(self):
        index = bridge.build_contact_index([self.path])
        phone_map, email_map = index

        # Phone match tolerates formatting and country code differences.
        self.assertEqual(bridge.resolve_display_name("+15551234567", index), "Jane Doe")
        self.assertEqual(bridge.resolve_display_name("+46 70 123 45 67", index), "Sven Svensson")
        # Email match is case-insensitive; org used when no personal name.
        self.assertEqual(bridge.resolve_display_name("boss@example.com", index), "Acme Inc")
        self.assertEqual(bridge.resolve_display_name("PLAIN@EXAMPLE.COM", index), "Pat Plain")
        # Unknowns stay blank.
        self.assertEqual(bridge.resolve_display_name("+19998887777", index), "")
        # The empty-number record was skipped.
        self.assertNotIn("", phone_map)
        self.assertEqual(len(email_map), 2)

    def test_missing_addressbook_never_raises(self):
        # A path that doesn't exist must yield empty maps, not an exception.
        index = bridge.build_contact_index(["/nonexistent/AddressBook-v22.abcddb"])
        self.assertEqual(index, ({}, {}))
        self.assertEqual(bridge.resolve_display_name("+15551234567", index), "")

    def test_query_messages_enriches_display_name(self):
        # End-to-end: a chat.db handle matching a contact gets its name in displayName.
        index = bridge.build_contact_index([self.path])
        fd, chat_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            conn = sqlite3.connect(chat_path)
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
            conn.execute("INSERT INTO handle (ROWID, id) VALUES (1, '+1 555-123-4567')")
            conn.execute("INSERT INTO handle (ROWID, id) VALUES (2, '+19998887777')")
            conn.execute("INSERT INTO message VALUES (10,'g1','hi',NULL,1,2000000000,0,'iMessage')")
            conn.execute("INSERT INTO message VALUES (11,'g2','yo',NULL,2,3000000000,0,'iMessage')")
            conn.commit()
            conn.close()

            db = bridge.open_db(chat_path)
            rows = bridge.query_messages(db, since=0, limit=200, contact_index=index)
            db.close()
        finally:
            os.remove(chat_path)

        by_id = {r["id"]: r for r in rows}
        self.assertEqual(by_id["g1"]["displayName"], "Jane Doe")  # known contact enriched
        self.assertEqual(by_id["g2"]["displayName"], "")  # unknown handle stays blank


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
