// =============================================================================
// CORTEX WhatsApp bridge — READ-ONLY. Read this before changing anything.
//
// WHY IT'S BUILT THIS WAY (spec §7):
//   - There is NO official API for reading your own personal WhatsApp inbox. The
//     WhatsApp Business/Cloud API cannot do it. So this uses an unofficial
//     multi-device client (whatsmeow), which violates WhatsApp ToS and carries
//     non-deterministic ban risk.
//   - Ban risk is overwhelmingly driven by OUTBOUND behaviour (proactive messages
//     to non-contacts, high send velocity, unanswered-message counters). Passive,
//     read-only ingestion of your own INCOMING messages is the lowest-risk pattern
//     that exists — but not zero risk.
//   - Therefore this service is READ-ONLY: it ingests incoming messages and SENDS
//     NOTHING. There is deliberately no send path. Do not add one here — that is a
//     later, explicitly-gated decision (spec §6/§7).
//   - It is ISOLATED in its own process/container behind a tiny HTTP API. If the
//     linked number is restricted, the operator loses one connector, not the brain.
//     Kill this container and the rest of CORTEX is unaffected.
//   - Number: link a BURNER/secondary number (the operator's choice), never assume
//     the primary. The whatsmeow session lives in WA_STORE — swap the number by
//     wiping it and re-scanning.
//
// SUPPLY-CHAIN (spec §7 #4): canonical repo only (go.mau.fi/whatsmeow =
// github.com/tulir/whatsmeow), pinned via go.sum. Never a fork promising
// "undetectable" anything.
//
// The only thing CORTEX pulls from here is GET /messages?since=<seq> (Bearer auth,
// localhost/compose-network only).
// =============================================================================

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

var (
	latestQR string
	qrMu     sync.RWMutex
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	storePath := env("WA_STORE", "/data/wa.db")
	addr := env("WA_HTTP_ADDR", ":8080")
	token := os.Getenv("WHATSAPP_BRIDGE_TOKEN")
	if token == "" {
		fmt.Fprintln(os.Stderr, "WHATSAPP_BRIDGE_TOKEN is required")
		os.Exit(1)
	}

	ctx := context.Background()
	dsn := "file:" + storePath + "?_foreign_keys=on"
	container, err := sqlstore.New(ctx, "sqlite3", dsn, waLog.Stdout("db", "WARN", true))
	if err != nil {
		panic(err)
	}

	inbox, err := sql.Open("sqlite3", dsn)
	if err != nil {
		panic(err)
	}
	if err := ensureSchema(inbox); err != nil {
		panic(err)
	}

	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		panic(err)
	}
	client := whatsmeow.NewClient(device, waLog.Stdout("client", "INFO", true))

	client.AddEventHandler(func(evt any) {
		msg, ok := evt.(*events.Message)
		if !ok || msg.Info.IsFromMe {
			return // READ-ONLY: ingest only incoming messages
		}
		text := extractText(msg.Message)
		if text == "" {
			return // V1 ingests text; media/other ignored
		}
		_ = insertMessage(inbox, msg.Info.ID, msg.Info.Chat.String(), msg.Info.Sender.String(),
			msg.Info.PushName, msg.Info.Timestamp.Unix(), text)
	})

	if client.Store.ID == nil {
		qrChan, _ := client.GetQRChannel(ctx)
		if err := client.Connect(); err != nil {
			panic(err)
		}
		go func() {
			for e := range qrChan {
				if e.Event == "code" {
					qrMu.Lock()
					latestQR = e.Code
					qrMu.Unlock()
					fmt.Println("[wa-bridge] Link a device in WhatsApp → Linked Devices, scan this code:")
					fmt.Println(e.Code)
				} else {
					fmt.Println("[wa-bridge] login:", e.Event)
				}
			}
		}()
	} else {
		if err := client.Connect(); err != nil {
			panic(err)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	mux.HandleFunc("/status", authed(token, func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"connected": client.IsConnected(), "loggedIn": client.Store.ID != nil, "jid": jidString(client)})
	}))
	mux.HandleFunc("/qr", authed(token, func(w http.ResponseWriter, _ *http.Request) {
		if client.Store.ID != nil {
			writeJSON(w, map[string]any{"loggedIn": true})
			return
		}
		qrMu.RLock()
		code := latestQR
		qrMu.RUnlock()
		writeJSON(w, map[string]any{"qr": code})
	}))
	mux.HandleFunc("/messages", authed(token, func(w http.ResponseWriter, r *http.Request) {
		since, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 500 {
			limit = 200
		}
		msgs, err := queryMessages(inbox, since, limit)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"messages": msgs})
	}))

	srv := &http.Server{Addr: addr, Handler: mux}
	go func() {
		fmt.Println("[wa-bridge] read-only, listening on", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintln(os.Stderr, "http:", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	client.Disconnect()
	_ = srv.Close()
}

func extractText(msg *waE2E.Message) string {
	if msg == nil {
		return ""
	}
	if c := msg.GetConversation(); c != "" {
		return c
	}
	if e := msg.GetExtendedTextMessage(); e != nil {
		return e.GetText()
	}
	return ""
}

// --- The inbox store (testable, independent of whatsmeow) --------------------

type message struct {
	Seq       int64  `json:"seq"`
	ID        string `json:"id"`
	ChatJid   string `json:"chatJid"`
	SenderJid string `json:"senderJid"`
	PushName  string `json:"pushName"`
	Timestamp int64  `json:"timestamp"`
	Text      string `json:"text"`
}

func ensureSchema(db *sql.DB) error {
	_, err := db.Exec(`create table if not exists inbox (
		seq integer primary key autoincrement,
		wa_id text unique, chat_jid text, sender_jid text,
		push_name text, ts integer, text text)`)
	return err
}

// insertMessage is idempotent on the WhatsApp message id (insert or ignore).
func insertMessage(db *sql.DB, id, chat, sender, push string, ts int64, text string) error {
	_, err := db.Exec(
		`insert or ignore into inbox (wa_id, chat_jid, sender_jid, push_name, ts, text) values (?,?,?,?,?,?)`,
		id, chat, sender, push, ts, text,
	)
	return err
}

func queryMessages(db *sql.DB, since int64, limit int) ([]message, error) {
	rows, err := db.Query(
		`select seq, wa_id, chat_jid, sender_jid, push_name, ts, text from inbox where seq > ? order by seq asc limit ?`,
		since, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]message, 0)
	for rows.Next() {
		var m message
		if err := rows.Scan(&m.Seq, &m.ID, &m.ChatJid, &m.SenderJid, &m.PushName, &m.Timestamp, &m.Text); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func jidString(c *whatsmeow.Client) string {
	if c.Store.ID != nil {
		return c.Store.ID.String()
	}
	return ""
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func authed(token string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		h(w, r)
	}
}
