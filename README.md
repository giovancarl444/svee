# impact.com integration

A production-grade, typed, resilient integration layer for the
[impact.com](https://impact.com) affiliate/partnership platform — a versioned
client + data pipeline + dashboard, built to extend for months, not a one-off
script.

> **Status:** the library and pipeline are complete and unit-tested (78 tests,
> mocked HTTP). The *live* steps (persona detection, smoke test, real syncs) are
> wired but not yet run — this scaffold was built without credentials and without
> network egress to impact.com. See **[docs/INTEGRATION_NOTES.md](docs/INTEGRATION_NOTES.md)**
> for the exact runbook and the list of ⚠️ items to verify against live docs.

## Quick start

```bash
cp .env.local.example .env.local        # then paste SID + token (lines 14–15)
npm install
npm run persona                         # auto-detect brand/partner/agency
npm run smoke                           # authed GET + report/partners/actions counts
```

Nothing sensitive is committed: `.env.local` is gitignored.

## What's in the box

```
src/
  client/      http (retry/backoff/jitter/Retry-After) · pagination · deferred jobs
               · persona detect · config · logger (redacting) · façade
  resources/   reports · actions · clicks · partners/programs · catalogs
               · media-properties · deals (partner) · conversions
               · tracking-links · unique-urls · promo-codes
  sync/        schema.sql · idempotent upserts · watermarks · backfill · retention
               · persona-aware dashboard metrics (SubId / program breakdowns)
  webhooks/    postback receiver (signature verify · dedupe · upsert) + Node/Next
  automation/  reconciliation (API vs DB drift) · alerting (EPC drop / reversals)
  scripts/     persona · smoke · sync · backfill · snapshot · reconcile · alerts
dashboard/     mobile-first static dashboard (reads a metrics snapshot)
docs/          INTEGRATION_NOTES.md (the memory) · EXTENDING.md
```

## Commands

| Command | What it does |
|---|---|
| `npm run persona` | Auto-detect persona by probing Campaigns under each base path |
| `npm run smoke` | Phase-1 acceptance: auth + report + partners + actions |
| `npm run sync` | Incremental pull → idempotent upsert into the warehouse |
| `npm run backfill -- --days 90` | Historical load of actions + clicks |
| `npm run snapshot` | Compute dashboard metrics → `dashboard/public/metrics.json` |
| `npm run reconcile` | Nightly API-vs-DB drift check (exit 1 on drift) |
| `npm run alerts` | EPC-drop / reversal-spike partner alerts |
| `npm run webhook` | Run the postback receiver locally |
| `npm run gen:types` | Generate typed models from the OpenAPI spec |
| `npm test` / `npm run typecheck` | Unit tests (mocked HTTP) / typecheck |

## Design principles (the non-negotiables)

- **Never hardcode secrets** — `.env.local` only, redacted in logs (last-4).
- **Never guess an endpoint/field/version** — everything unverified against live
  docs is flagged `⚠️ VERIFY` and centralised so a fix is one edit. See the
  verification ledger in `docs/INTEGRATION_NOTES.md` §4.
- **Resilient by default** — every call retries 429/5xx/network with jittered
  backoff and respects `Retry-After`.
- **Deferred-aware** — large reports/exports go through submit → poll → download.
- **Idempotent writes** — conversions dedupe on our `OrderId`; DB upserts on
  natural keys; postbacks dedupe on event id. Retries never double-count.
- **Dry-run first** — writes log the exact request; `--live` (or `IMPACT_LIVE=1`)
  is required to actually fire.
- **GDPR-aware** — emails hashed at the edge, no raw PII in logs/repo, retention
  TTL on synced tables.

## Dashboard

`npm run sync && npm run snapshot`, then **serve** the folder (browsers block
`fetch()` on `file://`, so don't just double-click the file):

```bash
npx serve dashboard/public      # or: python3 -m http.server --directory dashboard/public
```

Mobile-first and persona-aware; renders an 8-tile KPI grid (approved revenue,
pending value, EPC, conversion rate, clicks, actions, payout, reversal rate), an
action-state funnel, a daily revenue+clicks trend, **SubId1 tracking** (the
Shopify store/placement dimension), top programs, media properties, deals, and
top catalog items ([preview](docs/dashboard-preview.png)). Deploy the folder to
Vercel or any static host. The house-stack Next.js route version is documented inline in
`src/webhooks/next-route.ts` and `docs/EXTENDING.md`.

## Deploy (always-up, no PC required)

Recommended topology:

- **Supabase** — the Postgres warehouse. Apply the schema once: `npm run migrate`
  (also auto-applied on the first `npm run sync`). Use the **transaction pooler**
  connection string for serverless.
- **GitHub Actions** — the scheduler. `.github/workflows/sync.yml` runs
  `sync → snapshot → reconcile` nightly (and on demand via *Run workflow*). Add
  repo **secrets** `IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN`, `DATABASE_URL` and
  **variables** `IMPACT_PERSONA=partner`, `DB=supabase`.
- **Vercel** — hosts the dashboard + live API. `vercel.json` builds the library
  and serves `dashboard/public` statically with two functions:
  - `GET /api/metrics` — live `DashboardMetrics` from the warehouse (the
    dashboard fetches this, falling back to the static snapshot).
  - `GET/POST /api/postback` — the webhook receiver.
  Set the same env vars in Vercel (DB, DATABASE_URL, IMPACT_*, and
  `WEBHOOK_SIGNING_SECRET` for postbacks). Point impact.com postbacks at
  `https://<app>/api/postback?token=<WEBHOOK_SIGNING_SECRET>`.

Once secrets are in, trigger the Actions workflow to populate the DB and the
Vercel dashboard shows live numbers.

## Adding an endpoint

See **[docs/EXTENDING.md](docs/EXTENDING.md)** — a resource module + one wire-up
line + a mocked test, typically under 10 minutes.

---

# SVEE//TWIN — job-application digital twin

A second subsystem living in `src/twin/`, sharing this repo's stack (TypeScript +
zod, the Supabase warehouse, GitHub Actions cron, Vercel). It applies for jobs as
Svee — scoring, tailoring, and staging applications — and **stops at every
irreversible action, queuing it for one-tap human approval**. It does 100% of the
*work*, never the final *click*.

```
src/twin/
  kb.schema.ts · kb.ts · kb.data.ts   the Knowledge Base (the twin's only facts) + slot flagging
  scoring.ts                          deterministic fit rubric + hard filters (the gate before effort)
  channel.ts                          where/how to apply (ATS > email > LinkedIn), least ToS risk
  guardrails.ts                       HARD STOPS + the code-layer executor that refuses to submit
  tailor.ts                           CV variant, KB-bound cover letter, screening answers, truth validator
  inbox.ts                            bilingual reply classification (rejection/screen/interview/offer)
  prompt.ts · llm.ts                  system prompt + pluggable Claude client (dry-run without a key)
  loop.ts                             the 7-step daily loop → the JSON output contract
  contracts.ts                        zod schemas for digest / approvals / alerts / pipeline writes
  store.ts · schema.sql               the pipeline warehouse (jobs·applications·messages·approvals·digests)
  sources/                            pluggable adapters + RawListing → RoleFacts parser
```

## Commands

| Command | What it does |
|---|---|
| `npm run twin:score -- <url\|--input f.json>` | Score listings only — tune the threshold/weights, no DB, no drafting |
| `npm run twin:migrate` | Apply the twin schema + snapshot the KB (needs a DB) |
| `npm run twin:run -- --input f.json --inbox g.json` | The daily loop: intake → score → tailor → stage → track → route → report |

`twin:run` emits one JSON `TwinRunOutput` on stdout and a human summary on
stderr. Default is **stage-only** (`TWIN_LIVE=0`): it stages everything and
queues each hard-stop as a pending approval. `--live` only ever hands off an
*approved* action — it never bypasses an approval row.

## The two guarantees

- **Truth** — every claim comes from the KB. A cover letter that cites a number
  not in the Achievement Bank is rejected in favour of the deterministic,
  provably-KB-bound letter; unfilled KB slots are flagged, never invented.
- **The approval boundary** — enforced twice: the model refuses hard-stop actions
  (prompt), and the executor has no credentials and no submit path (code). See
  **[docs/TWIN_NOTES.md](docs/TWIN_NOTES.md)** for the full runbook, tuning knobs,
  and first-run checklist.

## Deploy (twin)

- **GitHub Actions** — `.github/workflows/twin.yml` runs the loop daily. Secrets:
  `DATABASE_URL` (and `DATABASE_PASSWORD`, `ANTHROPIC_API_KEY`); variable `DB=supabase`.
- **Vercel** — `GET /api/twin-queue` serves the Cortex view (pending approvals +
  latest digest); `dashboard/public/twin.html` is the mobile-first queue.
- **Live LLM drafting** is optional: `npm install @anthropic-ai/sdk` and set
  `ANTHROPIC_API_KEY`. Without it, drafting is deterministic and KB-bound.
