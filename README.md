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

## Cron

`.github/workflows/sync.yml` runs `sync → snapshot → reconcile` daily. Add the
same env as repo/Actions secrets. A Vercel Cron equivalent hits the Next.js
route on the same schedule.

## Adding an endpoint

See **[docs/EXTENDING.md](docs/EXTENDING.md)** — a resource module + one wire-up
line + a mocked test, typically under 10 minutes.
