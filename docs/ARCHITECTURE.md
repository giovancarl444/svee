# CORTEX — Architecture

## The shape

Everything funnels into one `items` table via **adapters** that all implement the
same interface. The intelligence layer reads `items`, writes `classifications`,
`open_loops`, and `briefs`. The dashboard reads all of it. Adding a source later
is one adapter — nothing else changes.

```
 SOURCES        INGESTION         NORMALIZATION     INTELLIGENCE          SURFACE
 Gmail   ─OAuth─▶ gmail adapter ─┐                  triage   (Haiku)      Priority
 IMAP    ───────▶ imap adapter  ─┼─▶  normalize ──▶ escalate (Sonnet) ─▶  Tomorrow
 WhatsApp ─sess─▶ wa module     ─┤    → items[]     plan     (Opus)       Inbox
 Calendar ──────▶ cal adapter   ─┘                  loops + deadlines     Loops · Signals
                                        │                   │
                                        ▼                   ▼
                         Postgres (encrypted at rest): items, threads, entities,
                         classifications, open_loops, briefs, api_calls, connectors
```

## Packages

| Package | Responsibility |
| --- | --- |
| `@cortex/config` | zod-validated, **server-only** env. Boots with a near-empty `.env`; integration secrets are validated at point of use. |
| `@cortex/core` | The `SourceAdapter` interface, the normalized `Item` shape, and the controlled vocabulary (`SOURCES`, `CATEGORIES`, …) as `as const` tuples — the single source of truth the DB enums are built from. |
| `@cortex/db` | The Drizzle schema (the spine), migrations, the DB client, and **column-level encryption** for message bodies. |
| `@cortex/ai` | Model routing (Haiku/Sonnet/Opus), the **redaction/allowlist** layer, the `api_calls` audit writer, and a forced-tool structured-output Claude wrapper. |
| `@cortex/workers` | The ingestion loop + triage + nightly synthesis runners. Adapters register into a registry; the loop isolates per-connector failures. |
| `@cortex/dashboard` | Next.js 15. Five Server-Component views, Server Actions for mutations (Phase 1+), design tokens, vendored fonts. |

## The adapter contract (`@cortex/core`)

```ts
interface SourceAdapter {
  readonly source: SourceName;
  fetchSince(checkpoint: Checkpoint): Promise<RawItem[]>; // idempotent
  normalize(raw: RawItem): NormalizedItem;                // pure
  getCheckpoint(): Promise<Checkpoint>;
  setCheckpoint(c: Checkpoint): Promise<void>;
  status(): Promise<AdapterStatus>;
}
```

The loop, per source: `getCheckpoint → fetchSince → normalize → upsert (dedupe on
(source, source_item_id)) → advance checkpoint → enqueue triage`. Adapter state
(checkpoint + health) lives in the `connectors` table.

## Intelligence tiers (spec §8)

- **Tier 1 — Triage (Haiku).** Every non-bulk item. Cheap, structured JSON:
  category, urgency 0–3, requires_action, one-line action_summary, deadline,
  confidence. Bulk/newsletter mail is filtered by header heuristics *before* any
  model call.
- **Tier 2 — Escalation (Sonnet).** Re-runs low-confidence or money/legal/deadline
  items with more context. Appends a second `classifications` row (never
  overwrites — the passes are auditable).
- **Tier 3 — Synthesis (Opus).** Nightly. Takes the day's action items, open
  loops, and tomorrow's calendar and writes the Tomorrow Plan brief.

Open-loop tracking runs continuously: an item that implies the operator owes a
reply (or made a commitment) opens a loop; a later item that answers it closes it
(`resolved_by_item_id`).

## Data flow into the model (the privacy boundary)

The [`@cortex/ai` redaction layer](../packages/ai/src/redaction.ts) is the only
place a request payload is constructed. The object it returns is **both** what is
sent to Anthropic **and** what is stored in `api_calls.input_summary`. So for any
item, "what did CORTEX send about it?" is answerable exactly — that identity is
the audit guarantee. Snippets are hard-capped so a "snippet" can't smuggle a body.

## Rendering & resilience

Dashboard views are `force-dynamic` Server Components; every query is wrapped so
the UI renders cleanly against an empty or briefly-unreachable DB (the Connectors
view surfaces datastore health explicitly). No secret is ever read into a client
component — the auth banner and env reads happen server-side only.

## Scheduling (always-on)

The workers `serve` command runs the scheduler: an ingest→triage→escalate→loops
cycle immediately and every `CORTEX_SYNC_INTERVAL_MIN`, plus the nightly Opus
brief at `CORTEX_BRIEF_HOUR` (timezone-aware). Each run is isolated — a failure
logs and retries next interval, never crashing the loop. Source adapters add
exponential backoff on rate limits (429 / 403-rateLimit / 5xx). The `workers`
compose service runs `serve`.

## Deployment

All-in-one `docker-compose.yml`: `db` (Postgres 16) + a one-shot `migrate` +
`dashboard`, with `workers` (the always-on scheduler) behind a `--profile workers`
gate and the read-only WhatsApp bridge behind `--profile whatsapp`. Ports bind to
loopback; access is via Tailscale / reverse proxy. Put the Postgres volume on an
encrypted disk for defense-in-depth on top of column encryption.
