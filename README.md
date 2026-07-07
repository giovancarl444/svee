# CORTEX

A single-operator **personal brain**. It ingests every inbound channel (email,
WhatsApp, calendar, more later) into one normalized store, uses Claude to triage
the noise, surfaces only what actually needs a human, extracts commitments and
deadlines, and writes a blunt "what to do tomorrow" brief each evening.

Private, single-user, **self-hosted-first**. Not a SaaS. Optimized for the
operator's leverage and privacy — not scale.

> **Status — Phase 1 (Gmail end-to-end) complete.** The full spine runs: Gmail
> adapter → normalize → encrypted `items` → bulk heuristic + Haiku triage →
> the Priority view, behind single-operator login. Add Google OAuth creds
> (`pnpm gmail:auth`) and an `ANTHROPIC_API_KEY` to ingest real mail. See
> [build phases](#build-phases).

---

## The non-negotiables (why it's built this way)

1. **Local-first.** The datastore and all workers run on infrastructure the
   operator controls. No third party ever reads raw message content — except the
   Claude API, whose exposure is explicit, minimized, and audited.
2. **Data minimization to the model.** Only the fields a given call needs leave
   the box (subject + sender + snippet, never full chains). The
   [redaction/allowlist layer](packages/ai/src/redaction.ts) is the only way a
   payload is built, and it is logged verbatim to `api_calls`.
3. **Secrets are server-side only.** Never in the repo, never in the browser
   bundle. See [`.env.example`](.env.example).
4. **The only outbound calls** are the source APIs, the WhatsApp module, and the
   Anthropic API. No analytics, no telemetry, no CDN. **Fonts are vendored**
   ([Geist + Instrument Serif](apps/dashboard/app/fonts)).
5. **Encryption at rest.** Message bodies are AES-256-GCM encrypted at the column
   level ([`crypto.ts`](packages/db/src/crypto.ts)); the key lives outside the DB.
6. **Read-only in V1.** CORTEX observes and advises. It sends nothing on the
   operator's behalf. Acting-on-your-behalf is a later, explicitly-gated phase.
7. **Mobile-first.** The dashboard is built for ~380px first, desktop second.

## Stack & the decisions made

- **TypeScript** everywhere, a **pnpm** monorepo.
- **Dashboard:** Next.js 15 (App Router, Server Components, Server Actions).
- **Datastore: Postgres + Drizzle** (chosen over self-hosted Supabase). For one
  operator, Drizzle is leaner — a single DB container, type-safe migrations, and
  full control over exactly what leaves the box, with far less surface to audit
  against the no-egress / supply-chain rules. Dashboard auth is handled by the app
  behind a VPN/reverse proxy rather than a bundled multi-tenant auth stack.
- **AI:** Anthropic API, routed by cost — Haiku (triage) → Sonnet (escalation) →
  Opus (nightly synthesis). Haiku is the default; you earn your way up to Opus.
- **Hosting:** all-in-one **Docker Compose** on an operator-owned always-up host,
  reached over **Tailscale** (never a public port). A VPS makes Gmail Pub/Sub
  push viable; incremental polling is the robust default.

Integrations are grounded in **current official docs**, captured at build time in
[`docs/live-docs/`](docs/live-docs/) — not implemented from memory.

## Repository layout

```
apps/
  dashboard/   Next.js 15 — the 5 views, design tokens, vendored fonts
  workers/     ingestion + intelligence runners (tsx, standalone)
packages/
  config/      zod-validated, server-only env
  core/        SourceAdapter interface + normalized types (the enum vocabulary)
  db/          Drizzle schema (the spine), migrations, column encryption
  ai/          model routing · redaction/allowlist · api_calls audit · Claude wrapper
docs/
  ARCHITECTURE.md · SECURITY.md · live-docs/ (the integration ledger)
```

## Quick start

### All-in-one (the intended deployment)

```bash
cp .env.example .env          # fill in secrets (see below)
docker compose up             # db + migrate + dashboard  →  http://127.0.0.1:3000
```

Ports bind to `127.0.0.1` only. Reach the dashboard from your phone over Tailscale
or a reverse proxy — never open a public port (Constraint §10).

Minimum to boot Phase 0: `POSTGRES_*` (defaults work) and a
`CORTEX_ENCRYPTION_KEY` (`openssl rand -base64 32`). `ANTHROPIC_API_KEY` and the
connector credentials come online in Phase 1+.

### Local development

```bash
pnpm install
pnpm db:generate              # regenerate SQL migrations from the schema
pnpm db:migrate               # apply them (needs DATABASE_URL)
pnpm dev                      # dashboard at http://localhost:3000
pnpm typecheck && pnpm test   # full workspace check
```

## Build phases

| Phase | Scope | State |
| --- | --- | --- |
| **0 — Skeleton** | Monorepo, full schema + migrations, design tokens, 5 views wired to (empty) data | ✅ **done** |
| **1 — Gmail e2e** | Gmail adapter → normalize → encrypted items → bulk heuristic + Haiku triage → Priority view; operator login | ✅ **done** |
| 2 — The brief | Open-loop tracking + nightly Opus Tomorrow Plan | next |
| 3 — Breadth | IMAP + Calendar, entity unification, Sonnet escalation | — |
| 4 — WhatsApp | Isolated, read-only, dependency-pinned module | — |
| 5 — Polish | Bulk heuristics, importance learning, notifications, audit panel | — |

## What "Phase 0 done" means here

Verified end-to-end against a live Postgres 16: migrations apply, all five views
serve (200), seeded data renders (an urgency-3 action item with its Signal
marker, the Connectors health + the "what left the box" audit row), and empty
states render where there's nothing yet. `pnpm typecheck` and `pnpm test` are
green. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/SECURITY.md`](docs/SECURITY.md).
