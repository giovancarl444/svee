# CORTEX roadmap — from "personal brain" to "personal command center"

Where CORTEX is today (2026-07-08): four real sources connected read-only (Gmail,
Outlook, iMessage, Calendar), an always-on scheduler, a nightly Tomorrow Plan, a
mobile dashboard, all local + $0. It **observes and advises**. The next chapter is
letting the operator **act** from it — while never crossing the read-only line that
makes it safe.

**The one hard rule that shapes every item below:** V1 is read-only. CORTEX never
sends. "Act from the dashboard" means it *drafts, links, and tracks* — the operator
does the actual sending in their own client. Any feature that would need a send
path is explicitly out of scope until a deliberate, gated V2 decision.

---

## A. Dashboard: act, don't just read (the operator's asks)

### A1. Check things off ✅ (extend what exists)
- **Now:** Priority (`/`) already has `✓ done` + `⤓ snooze 1d` (Server Actions, auth-gated).
- **Build:** surface done/snooze on **Inbox** and **Loops** too; add an "undo" toast; a
  "done today" count; optional "done" filter. Closing a loop from the dashboard
  should mark the underlying open_loop resolved, not just hide the item.
- *Read-only:* yes — these write only to CORTEX's own DB (item state / loop state),
  never to the source account.

### A2. Jump to the real message 🔗
- A button on each item that opens the actual thread in the source app:
  - **Gmail:** `https://mail.google.com/mail/u/0/#all/<threadId>` (or `#search/rfc822msgid:<id>`)
  - **Outlook:** `https://outlook.live.com/mail/0/` + search by message-id (IMAP has no
    stable web deep-link; fall back to a search URL)
  - **iMessage:** `imessage://<handle>` / `sms:<handle>` — opens Messages to that chat
  - **Calendar:** the event's `htmlLink`
- *Design:* derive the URL from data already stored (`raw`, `sourceThreadId`, handle).
  Add a pure `sourceDeepLink(item)` helper; render it as an "Open ↗" link. No new
  egress, no send path.

### A3. Draft-my-reply ✍️ (the flagship — read-only, local)
- "Suggest a reply" on an item → the local model drafts a reply *in the operator's
  voice* from the thread; the operator reviews, edits, and **sends it themselves** in
  their real client (copy button / `mailto:` prefill). CORTEX never sends.
- **Security design (must hold):**
  - Stays read-only — output is text for the human; there is **no** send path.
  - The draft needs more context than triage (the thread body). That payload is a
    **new, explicit purpose** built ONLY in `redaction.ts` (`buildReplyDraftPayload`),
    bounded (last N messages, capped length), and audited in `api_calls` like every
    other call. Redaction stays the sole payload constructor.
  - **Local-model only by default.** Drafting sends thread bodies to the model; on
    Ollama that never leaves the box. Using a *hosted* model for drafts must be a
    separate, explicit opt-in (it would send more than the triage allowlist).
  - Tone: learn the operator's style from their own sent messages (already ingested —
    `in:sent`), never invent facts, flag when it's unsure.

### A4. Dashboard polish
- Per-source filter + unread/needs-action counts; entity page (all threads with a
  person); a "why is this here?" explainer per item (already partly in `inspect/[id]`).

---

## B. Sharper intelligence (the engine)

- **B1. Better synthesis.** The 7B local model dedupes structurally now but still
  glitches (stray link, stray glyph). Options: a larger local model for *synthesis
  only* (RAM permitting), or a cheap hosted tier (DeepSeek) just for the nightly
  brief — triage stays local. Add a post-process that strips hallucinated URLs.
- **B2. Importance learning.** Today all senders default importance 1. Learn from
  behavior (who the operator replies to fast, VIPs) to weight triage + the brief.
- **B3. Entity enrichment.** Contact-name resolution shipped for iMessage; extend to
  merge the same person across channels (email + phone) and surface a unified entity.
- **B4. Per-source tuning + wider history.** Configurable slices per source; smarter
  bulk detection for the operator's specific newsletter set; a "financial" lane that
  aggregates all payment deadlines (Klarna/Qliro/Walley…) into one view.

## C. Operations & safety

- **C1. Strong operator password** — replace the throwaway demo credential (real data
  is behind it now). *[doing first]*
- **C2. Permanence (launchd)** — auto-start scheduler + bridge on boot (`scripts/
  install-service.sh` is committed; enable on request).
- **C3. Private remote access (Tailscale)** — reach the dashboard from a phone over a
  private mesh, never a public URL. Real personal data + lightweight auth = never
  publicly exposed.
- **C4. Encrypted backups** — the Postgres volume (encrypted at column level already);
  a documented, encrypted backup/restore of the DB + `.env` key handling.

## D. Product / future ("everyone would want this")

- Packaged one-command install for non-engineers; a setup wizard for the OAuth steps
  (the loopback auto-capture already removes most friction).
- Multi-account, multi-user (each self-hosted, isolated) — carefully, given the data.
- Mobile-native shell over the same local backend (via Tailscale).

---

## Execution order (my recommendation — we take them off the top)

| # | Item | Why here | Read-only? | Status |
|---|------|----------|-----------|--------|
| 1 | **C1 Strong password** | real data behind a throwaway demo pw | n/a | ← starting |
| 2 | **A2 Jump-to-message** | high value, self-contained, low risk | yes | next |
| 3 | **A1 Check-off everywhere** | extends a working feature | yes | |
| 4 | **A3 Draft-my-reply (local)** | the flagship; needs careful redaction design | yes (no send) | |
| 5 | **C2 Permanence (launchd)** | survive reboots | yes | files ready |
| 6 | **B1 Better synthesis** | brief quality ceiling | yes | |
| 7 | **B4 / B2 coverage + importance** | sharper signal | yes | |
| 8 | **C3 Tailscale remote** | mobile access, privately | yes | needs operator |

Everything above is read-only. The moment an item would require sending, it stops
and becomes an explicit V2 conversation — never a quiet addition.
