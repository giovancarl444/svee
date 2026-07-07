# CLAUDE.md

Guidance for working in this repo. Read `README.md`, `docs/ARCHITECTURE.md`, and
`docs/SECURITY.md` for the full picture.

## What this is

CORTEX — a single-operator, self-hosted "personal brain". Read-only ingestion of
Gmail / IMAP / Calendar / WhatsApp → one encrypted Postgres store → cost-routed
Claude triage (Haiku → Sonnet → Opus) → a mobile-first dashboard + a nightly brief.
It is **read-only in V1**: it observes and advises, and **sends nothing**. Do not
add a send path (email, WhatsApp, anything) without an explicit, gated decision.

## The constraints that override defaults

1. Local-first; the only outbound calls are the source APIs + Anthropic. No
   analytics/telemetry/CDN. Fonts are vendored.
2. Data minimization: the **redaction/allowlist layer** (`packages/ai/src/redaction.ts`)
   is the ONLY constructor of model payloads, and what it returns is stored verbatim
   in `api_calls`. Never send full bodies/chains.
3. Secrets are server-side only (env), never in the repo or the browser bundle.
4. Message bodies are AES-256-GCM encrypted at the column level.
5. Never expose the dashboard unauthenticated.

## Layout

- `apps/dashboard` — Next.js 15. Views live in `app/(secure)/` (auth-gated route
  group); `app/login` is outside it. Reads via `lib/queries.ts`; mutations via
  Server Actions in `app/(secure)/actions.ts`.
- `apps/workers` — the runner. `serve` = always-on scheduler; also `sync`,
  `ingest`, `triage`, `escalate`, `synthesize`, `gmail:auth`, `hash-password`.
- `packages/core` — `SourceAdapter` interface, normalized types, enum vocabulary,
  `isBulk` heuristic. The single source of truth for the controlled vocabularies.
- `packages/db` — Drizzle schema (the spine), migrations, column encryption, and
  the repo layer (all the SQL). Tests run against PGlite.
- `packages/ai` — model routing, redaction, `api_calls` audit, and the Claude
  calls (triage/escalate/synthesis).
- `packages/{gmail,imap,calendar,whatsapp}` — one read-only adapter each.
- `services/whatsapp-bridge` — the isolated Go whatsmeow sidecar (read-only).

## Conventions

- New source = one adapter implementing `SourceAdapter`; register it in
  `apps/workers/src/adapters.ts`. Adapters take an injected client facade + a
  `CheckpointStore` so they're unit-testable without network/DB.
- Checkpoints advance only after items persist: `getCheckpoint()` returns the
  persisted cursor, or the pending one after `fetchSince` (which the loop commits
  via `setCheckpoint`). A crash re-fetches (idempotent upsert), never gaps.
- `classifications` is append-only (never overwrite a pass). The "latest pass"
  wins in queries.
- Model IDs are pinned by env (`claude-haiku-4-5-20251001`, `claude-sonnet-5`,
  `claude-opus-4-8`). Don't send `temperature` to Sonnet 5 / Opus 4.8 — they
  reject it (see `docs/live-docs/anthropic-api.md`).
- Ground every integration in `docs/live-docs/` (captured from official docs), not
  memory. Refresh it before changing an adapter.

## Commands

```bash
pnpm install
pnpm typecheck && pnpm test          # full workspace check
pnpm db:generate                     # regenerate migrations after a schema change
pnpm db:migrate                      # apply (needs DATABASE_URL)
pnpm dev                             # dashboard
pnpm --filter @cortex/workers serve  # the always-on scheduler
(cd services/whatsapp-bridge && go test ./... && go build ./...)
```

## Gotchas

- Dashboard runs via `next start` (not `output: standalone`).
- DB / pipeline tests use PGlite via the `setTestDb` seam and run **serially**
  (each package's `vitest.config.ts` sets `fileParallelism: false`) — concurrent
  in-WASM Postgres instances otherwise time out.
- `next-env.d.ts` is gitignored; the dashboard typecheck tolerates its absence.
- Local scratch/verification scripts must never be committed (`scratch-*.ts` is
  gitignored). Run them from inside a package that has the `@cortex/*` symlinks.
- The WhatsApp bridge can't be run without a phone + WhatsApp reachability; its
  read path is covered by the Go store test, and the adapter by TS tests.
