package main

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestInboxStore(t *testing.T) {
	db, err := sql.Open("sqlite3", "file::memory:?cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := ensureSchema(db); err != nil {
		t.Fatal(err)
	}

	// Two incoming messages.
	if err := insertMessage(db, "wa-1", "chat@s", "dana@s", "Dana", 1000, "hi"); err != nil {
		t.Fatal(err)
	}
	if err := insertMessage(db, "wa-2", "chat@s", "dana@s", "Dana", 1001, "you there?"); err != nil {
		t.Fatal(err)
	}
	// Duplicate id is ignored (idempotent re-delivery).
	if err := insertMessage(db, "wa-1", "chat@s", "dana@s", "Dana", 1000, "hi"); err != nil {
		t.Fatal(err)
	}

	all, err := queryMessages(db, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 messages (dedup on id), got %d", len(all))
	}
	if all[0].ID != "wa-1" || all[1].ID != "wa-2" {
		t.Fatalf("wrong order/ids: %+v", all)
	}

	// The `since` cursor returns only newer rows.
	tail, err := queryMessages(db, all[0].Seq, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(tail) != 1 || tail[0].ID != "wa-2" {
		t.Fatalf("since cursor wrong: %+v", tail)
	}
}
