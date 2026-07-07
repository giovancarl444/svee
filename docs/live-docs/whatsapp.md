# WhatsApp (read-only)

_Surface:_ Read-only ingestion of a personal WhatsApp inbox for a self-hosted, privacy-focused tool (2026). There is NO first-party path: WhatsApp Business Platform / Cloud API only handles a business's own dedicated number and CANNOT read your existing personal chats/contacts. All viable routes ride the WhatsApp Web "multi-device" / linked-device protocol via an unofficial reverse-engineered client. Three routes compared: (a) mautrix-whatsapp — a full Matrix<->WhatsApp puppeting bridge built on the whatsmeow Go library; requires a Matrix homeserver (Synapse/Dendrite/Conduit) plus Postgres; heaviest infra, but battle-tested and gives you history backfill + a queryable event stream. (b) A thin whatsmeow microservice — you embed tulir/whatsmeow (go.mau.fi/whatsmeow, the same engine mautrix uses) directly, register an event handler for incoming *events.Message, and emit over a local Unix socket/HTTP; no Matrix, no homeserver, single Go binary + SQLite. (c) Baileys — WhiskeySockets/Baileys, a Node/TypeScript WebSocket implementation (npm `baileys`); popular, pure-JS, no native deps, but the JS/npm ecosystem is where the malicious `lotusbail` supply-chain attack lived. For pure read-only ingestion with minimal infra, (b) whatsmeow is the sweet spot.

## Current version
whatsmeow: rolling / commit-pinned, no semver tags — import path go.mau.fi/whatsmeow, repo github.com/tulir/whatsmeow (~6.7k+ stars, actively maintained by Tulir Asokan, the maunium.net author of mautrix). mautrix-whatsapp: 0.12.x series (2026); note upgrading directly from pre-v0.11.0 is unsupported, and the @lid registration-regex fix has been relevant since v0.5.0. Baileys: v7.0.0-rc13 (May 2026), npm package name `baileys` (scoped legacy alias @whiskeysockets/baileys); v7 introduced breaking changes. WhatsApp Cloud API (the official one, for completeness / to rule out): Graph API v23.0-era, business-number only — not applicable to personal inbox reading.

## Auth
Linked-device QR pairing (WhatsApp Web multi-device). On first run the client generates a QR code (or a phone-pairing code); you scan it once from Settings > Linked Devices in the WhatsApp app on the primary phone. This provisions Signal-protocol keys and a device identity that is persisted locally (whatsmeow: SQLite/Postgres sqlstore; Baileys: `useMultiFileAuthState` JSON creds; mautrix: bridge DB). Thereafter the session resumes headless without the QR until you unlink it or WhatsApp expires the device. No API key, no OAuth, no Meta app review — but also no official sanction: every route violates WhatsApp's Terms of Service (self-bots are disallowed), so the "credential" is the device session itself and must be protected like a password. Minimum scope for the stated goal: keep it strictly read-only — register a receive handler, never call SendMessage; optionally suppress even read-receipt/presence emission so the linked device looks passive.

## Key APIs
- **whatsmeow (go.mau.fi/whatsmeow) — RECOMMENDED thin route** — Embed as a Go library in a single microservice; the exact engine mautrix uses, so it is the best-tested unofficial reader. _(client.AddEventHandler + switch on *events.Message for incoming; client.GetQRChannel for pairing; sqlstore.Container for session persistence. Supports 'Receiving all messages', history sync, delivery/read receipts. Repo github.com/tulir/whatsmeow. No Matrix required.)_
- **mautrix-whatsapp (github.com/mautrix/whatsapp, docs.mau.fi)** — Full puppeting bridge if you already run (or want) Matrix; gives backfill and a durable, queryable event log via the homeserver. _(Requires Matrix homeserver (Synapse/Dendrite/Conduit) + Postgres + an appservice registration.yaml. Heaviest infra. Watch the @lid registration-regex gotcha (see gotchas). !wa commands manage the WhatsApp side.)_
- **Baileys (github.com/WhiskeySockets/Baileys, npm `baileys`)** — Node/TypeScript WebSocket client; use if your stack is JS and you want no Go/native build. _(makeWASocket + sock.ev.on('messages.upsert') for incoming; useMultiFileAuthState for creds; sock.ev.on('connection.update') exposes the QR. Pin the EXACT version and install ONLY from the canonical repo/npm name — the malicious lotusbail fork lived here.)_
- **WhatsApp Cloud API / Business Platform (official) — NOT usable** — Listed only to rule out: it cannot read your personal chats or contacts. _(Works only for a dedicated business number you migrate/register; inbound webhooks cover messages sent TO that business number, not your existing personal conversations.)_

## Incremental sync
There is no server-side cursor/historyId like Gmail; you get a live push stream plus an initial history-sync blob. Pattern per route: (whatsmeow) On connect, WhatsApp pushes an *events.HistorySync (recent chats/messages); thereafter every new inbound arrives as *events.Message in real time. Persist your own high-water mark — e.g. store the last processed message ID and Info.Timestamp per chat JID in your local DB — and dedupe on message ID (v.Info.ID) since history-sync and live events can overlap. The whatsmeow sqlstore already keeps device/session state; you add your own messages table. (mautrix) The bridge writes every event into the Matrix room timeline; incremental reads = follow the room's event stream / use the homeserver's /sync or the bridge DB, and it can request additional backfill from WhatsApp. (Baileys) `messages.upsert` fires with type 'notify' for new and 'append' for history; `chatModified`/`messaging-history.set` deliver the initial sync — track last message key per JID. In all cases: keep the session alive (auto-reconnect) so you don't miss the push window, and treat message ID as the idempotency key.

## Gotchas
- @lid MIGRATION REGEX (mautrix-whatsapp): WhatsApp is migrating internal identifiers from phone numbers to LIDs (@lid). Bridges set up before v0.5.0 generated an appservice user-ID namespace regex of @whatsapp_[0-9]+, which does NOT match LID-format user IDs. As WhatsApp migrates chats/groups to LIDs, those chats silently stop bridging. Fix: edit registration.yaml so the users regex is @whatsapp_.+ (or .*), NOT [0-9]+, then restart the homeserver (run !wa sync groups to repair membership). Critical subtlety: the BRIDGE never reads registration.yaml — the HOMESERVER does — so you must edit the copy your homeserver loads, not the one in the bridge's data dir. Also: direct upgrades from pre-v0.11.0 are unsupported.
- SUPPLY-CHAIN — lotusbail (Baileys): A malicious npm package named `lotusbail`, a fork of WhiskeySockets/Baileys, sat on npm for ~6 months and hit 56,000+ downloads (disclosed Dec 2025 by Koi Security; covered by BleepingComputer/The Register/SecurityWeek). It delivered a fully working Baileys-compatible API (so it passed code review) while wrapping the WebSocket to exfiltrate credentials, every inbound/outbound message, contacts and media, and — worst — embedded a hardcoded encrypted pairing code that re-links the attacker's device, granting persistent access to the victim's WhatsApp EVEN AFTER the package is uninstalled. Used 27 infinite-loop anti-debug traps. Mitigation: install ONLY from canonical sources (npm `baileys` / github.com/WhiskeySockets/Baileys; go.mau.fi/whatsmeow; github.com/mautrix/whatsapp), PIN EXACT versions + verify integrity hashes (lockfile), never a random fork, and audit the dependency tree.
- BAN RISK IS DRIVEN BY OUTBOUND BEHAVIOR, NOT READ: Meta's account actions key on outbound velocity (bursts of messages, robotic fixed-interval sending), a poor received-to-sent ratio / unanswered-message counters (send 1000, get 0 replies => flagged as spam), and Report-and-Block velocity from recipients. A strictly READ-ONLY linked device sends nothing, generates no unsolicited outbound, and cannot accrue spam reports — so it is the lowest-risk profile by construction. Residual risk is protocol/client fingerprinting of unofficial clients, so keep the session low-profile: one stable device, don't spam presence/read-receipts, don't run bulk features.
- INFRA / OPERATIONAL: mautrix = homeserver + Postgres + appservice wiring (heaviest). whatsmeow thin service = one Go binary + SQLite (lightest). Baileys = Node runtime + npm tree (lightest to code, heaviest supply-chain surface). All three break if you log out all linked devices or exceed WhatsApp's ~4-linked-device cap, and phone-side inactivity (>14 days offline of the primary phone historically) can drop linked devices.
- LEGAL/ToS: every option violates WhatsApp Terms of Service (automated/self-bot access). For a personal, self-hosted, single-account privacy tool the practical risk is account action against your own number, not legal action, but there is no supported/official path and Meta can ban at will.

## Canonical pattern
```ts
// Route (b): thin READ-ONLY whatsmeow ingestor (Go). Pin the module in go.mod:
//   require go.mau.fi/whatsmeow vX.Y.Z  (commit-pin; canonical import path only)
import (
    "context"
    "go.mau.fi/whatsmeow"
    "go.mau.fi/whatsmeow/store/sqlstore"
    "go.mau.fi/whatsmeow/types/events"
    _ "github.com/mattn/go-sqlite3"
)

container, _ := sqlstore.New(ctx, "sqlite3", "file:session.db?_foreign_keys=on", nil)
device, _ := container.GetFirstDevice(ctx)      // persisted linked-device identity
client := whatsmeow.NewClient(device, nil)

client.AddEventHandler(func(evt interface{}) {
    switch v := evt.(type) {
    case *events.Message:                       // <- incoming message
        // READ-ONLY: emit to a LOCAL socket; never call client.SendMessage(...)
        emitLocal(v.Info.ID, v.Info.Chat.String(), v.Info.Sender.String(),
                  v.Info.Timestamp, v.Message.GetConversation())
    case *events.HistorySync:
        ingestHistory(v.Data)                   // initial backfill blob
    }
})

if client.Store.ID == nil {                     // first run: QR pairing
    qr, _ := client.GetQRChannel(context.Background())
    _ = client.Connect()
    for e := range qr { if e.Event == "code" { renderQRToTerminal(e.Code) } }
} else {
    _ = client.Connect()                        // resume headless linked session
}
// De-dupe on v.Info.ID; persist last timestamp per chat as your high-water mark.
```

## Recommendation for CORTEX
For a privacy-focused self-hoster who wants READ-ONLY ingestion with MINIMAL infra, build route (b): a thin whatsmeow (go.mau.fi/whatsmeow) microservice. Rationale: (1) It is the same reverse-engineered engine that powers mautrix-whatsapp, so it is the most battle-tested reader available, but without dragging in a Matrix homeserver + Postgres — you ship one static Go binary with an embedded SQLite session store, ideal for a private box. (2) Go's dependency model + commit-pinning + the single canonical import path gives a far smaller supply-chain surface than the npm tree that hosted the malicious lotusbail Baileys fork; avoiding npm sidesteps that entire class of risk (and if you must use Node/Baileys, pin the exact `baileys` version from github.com/WhiskeySockets/Baileys and audit the lockfile — never a fork). (3) Read-only is the lowest ban-risk profile by construction: you register only an inbound *events.Message handler and never call SendMessage, so there is zero outbound velocity, no unanswered-message ratio to trip, and no recipient Report-and-Block exposure; keep presence/read-receipts quiet to stay low-profile. Choose mautrix-whatsapp instead ONLY if you already run Matrix or specifically want its history backfill + durable queryable timeline — and if you do, immediately fix the @lid registration.yaml regex (@whatsapp_.+, not [0-9]+) in the file your homeserver reads. Data stays entirely on your host in all cases; encrypt the session DB at rest since it holds the device keys.

## Citations
- [tulir/whatsmeow — Go library for the WhatsApp web multidevice API](https://github.com/tulir/whatsmeow)
- [whatsmeow package docs (go.mau.fi/whatsmeow) — pkg.go.dev](https://pkg.go.dev/go.mau.fi/whatsmeow)
- [mautrix/whatsapp — Matrix-WhatsApp puppeting bridge](https://github.com/mautrix/whatsapp)
- [mautrix bridges — Troubleshooting & FAQ (LID migration / registration regex fix)](https://docs.mau.fi/bridges/general/troubleshooting.html)
- [mautrix-whatsapp bridge setup docs](https://docs.mau.fi/bridges/go/setup.html?bridge=whatsapp)
- [mautrix/whatsapp CHANGELOG (v0.11/v0.12, registration namespace escaping)](https://github.com/mautrix/whatsapp/blob/main/CHANGELOG.md)
- [WhiskeySockets/Baileys — WhatsApp Web API (Node/TypeScript)](https://github.com/WhiskeySockets/Baileys)
- [BleepingComputer — Malicious npm package (lotusbail) steals WhatsApp accounts and messages](https://www.bleepingcomputer.com/news/security/malicious-npm-package-steals-whatsapp-accounts-and-messages/)
- [Koi Security — npm package with 56K downloads stealing WhatsApp messages (lotusbail)](https://www.koi.ai/blog/npm-package-with-56k-downloads-malware-stealing-whatsapp-messages)
- [The Register — Poisoned WhatsApp API package (lotusbail) steals messages and accounts](https://www.theregister.com/2025/12/22/whatsapp_npm_package_message_steal/)
- [Wapisimo — WhatsApp Unofficial API Ban Risk (outbound velocity, engagement ratio, report/block)](https://wapisimo.dev/blog/en/whatsapp-unofficial-api-ban-risk)
