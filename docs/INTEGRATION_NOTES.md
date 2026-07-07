# impact.com Integration — Notes & Memory

This file is the integration's memory: confirmed versions, the active persona,
every endpoint used with its (to-be-)verified path, gotchas, and observed rate
limits. Update it as you learn. **Keep it honest** — an unverified assumption
recorded here is worth ten silent ones in the code.

Last updated: 2026-07-06

---

## 0. Build-time environment constraints (READ FIRST)

This scaffold was built in a sandbox where **egress to `impact.com` was blocked**
by network policy and **no API credentials were provided**. Concretely:

| Thing | Status in this build | Why |
|---|---|---|
| `api.impact.com` reachable | ❌ blocked (403 at proxy CONNECT) | org egress policy |
| `integrations.impact.com` (docs, `llms.txt`, `.md`, OpenAPI) | ❌ blocked | org egress policy |
| `IMPACT_ACCOUNT_SID` / `IMPACT_AUTH_TOKEN` | ❌ absent | not provided |
| npm registry | ✅ reachable | allowed in `no_proxy` |

**Consequence:** everything that needs the live API or the live docs is *wired
but unverified*. The code compiles and the resilience/idempotency/verification
logic is covered by 78 unit tests (mocked HTTP). What remains is to run the live
steps from an environment that can reach impact.com, with real credentials, and
confirm the ⚠️ items below.

### To finish the live parts (runbook)

```bash
cp .env.local.example .env.local
# paste IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN into .env.local  (lines 14–15)
npm install
npm run persona     # auto-detect persona; confirm it matches IMPACT_PERSONA
npm run smoke       # 200 from Campaigns + report/partners/actions row counts
# then verify the ⚠️ items in §4 as real responses come back, and:
npm run gen:types   # generate src/types/generated.ts from the OpenAPI spec
```

---

## 1. Persona (§2)

- **Configured:** `brand` (default). Change `IMPACT_PERSONA` if `npm run persona`
  detects otherwise — it will print a warning and exit non-zero on mismatch.
- **Base paths** (`src/client/persona.ts`):
  - brand → `/Advertisers/{SID}/…`
  - partner → `/Mediapartners/{SID}/…`  ⚠️ VERIFY exact casing
  - agency → `/Agencies/{SID}/…`
- Detection probes `…/Campaigns` under each base path; exactly one should 200.

## 2. Versions (§3.9)

Pinned in `.env.local` and threaded through config (`src/client/config.ts`):

| Persona | Env var | Value in this build | Confirmed? |
|---|---|---|---|
| brand | `IMPACT_BRAND_VERSION` | 14 | ⚠️ NO — confirm on changelog |
| partner | `IMPACT_PARTNER_VERSION` | 16 | ⚠️ NO |
| agency | `IMPACT_AGENCY_VERSION` | 3 | ⚠️ NO |

⚠️ **Version application mechanism is unconfirmed.** `IMPACT_VERSION_STRATEGY`
defaults to `none` (impact.com's classic REST behaviour — no version in path or
header). If versioning docs say otherwise, set it to `header` (uses
`IMPACT_VERSION_HEADER`); `path` is intentionally left unimplemented so nobody
ships a guessed path. Confirm on `…/readme/versioning.md` + `changelog.md`.

## 3. Auth (§3.3)

HTTP Basic — `AccountSID` = username, `AuthToken` = password. Host
`https://api.impact.com`. Implemented in `src/client/http.ts`; the token is never
logged (redacted to last-4).

## 4. Endpoints used — verification ledger

All paths are **UNVERIFIED against live docs** (egress blocked). They are
centralised so corrections are one-line edits. Verify each against the reference
/ OpenAPI spec, then flip its box.

| Purpose | Path (relative to base) | Source file | Verified? |
|---|---|---|---|
| Persona probe / smoke | `…/Campaigns` | `persona-detect.ts`, `impact-client.ts` | ⬜ |
| Programs (partner) | `…/Campaigns` | `resources/programs.ts` | ⬜ |
| Actions (list/get) | `…/Actions`, `…/Actions/{id}` | `resources/actions.ts` | ⬜ |
| Clicks | `…/Clicks` | `resources/clicks.ts` | ⬜ |
| Media partners | `…/MediaPartners` | `resources/partners.ts` | ⬜ |
| Contracts | `…/Contracts` | `resources/partners.ts` | ⬜ |
| Catalogs / items | `…/Catalogs`, `…/Catalogs/{id}/Items` | `resources/catalogs.ts` | ⬜ |
| Report metadata | `…/Reports` | `resources/reports.ts` | ⬜ |
| Report export (deferred) | `…/ReportExport/{id}` | `resources/reports.ts` | ⬜ |
| Job poll | `QueuedUri` from job body | `client/deferred.ts` | ⬜ |
| Conversions (write) | `…/Conversions` | `resources/conversions.ts` | ⬜ |
| Tracking links | `…/Campaigns/{id}/TrackingLinks` | `resources/tracking-links.ts` | ⬜ |
| Unique URLs | `…/Campaigns/{id}/UniqueUrls` | `resources/unique-urls.ts` | ⬜ |
| Promo codes | `…/PromoCodes` | `resources/promo-codes.ts` | ⬜ |

### Field / param names to verify

- **Pagination envelope** (`src/client/pagination.ts` → `ENVELOPE`): `@nextpageuri`,
  `@page`, `@numpages`, `@pagesize`, `@total`.
- **Deferred job** (`src/client/deferred.ts` → `JOB`/`STATUS`): `Status`,
  `QueuedUri`, `ResultUri`; status vocabulary (QUEUED/RUNNING/COMPLETED/FAILED).
- **List filter params** (`src/resources/params.ts`): action/click date params
  (`StartDate` vs `ActionDateStart`), report params (`START_DATE`), data-array
  keys (`MediaPartners` vs `Media`, `Items` vs `CatalogItems`).
- **Conversion form fields** (`src/resources/conversions.ts`): `CampaignId`,
  `ActionTrackerId`, `OrderId`, `Amount`, `CurrencyCode`, `ClickId`, item-level
  indexing (`ItemSku1…`), and the hashed-email field name.
- **Date format** (`src/util/date.ts` → `toImpactDateTime`): `YYYY-MM-DDTHH:mm:ss`.

## 5. GDPR / PII (§3.7)

- Email hashing in `src/util/hash.ts`. ⚠️ **Algorithm unconfirmed** — defaults to
  SHA-1 (`HASH_ALGO`); confirm the exact spec + normalisation and flip the const.
- Raw email is never sent, logged, or stored — hashed at the edge, redacted in
  logs (`src/client/logger.ts`).
- Retention TTL: `DATA_RETENTION_DAYS` (default 395). `src/sync/retention.ts`
  purges clicks/actions older than the TTL by `event_date`. Aggregated
  `daily_performance` is retained (no row-level PII).

## 6. Rate limits (§3.4)

Observed numbers: _none yet_ (no live calls made). The client already:
- retries 429/5xx/network/timeout with full-jitter exponential backoff
  (`HTTP_BACKOFF_BASE_MS`..`HTTP_BACKOFF_MAX_MS`, `HTTP_MAX_RETRIES`);
- honours `Retry-After` as a floor;
- logs any `X-RateLimit-*` / `Retry-After` response headers at debug level.

➡️ **When live:** run `LOG_LEVEL=debug npm run smoke`, read the "rate-limit
headers" log lines, and record the real limits here.

## 7. Webhooks / postbacks (§Phase 3)

- Receiver: `src/webhooks/handler.ts` (core) + `server.ts` (Node) / `next-route.ts`
  (Vercel). Verifies a shared-secret token or HMAC signature, dedupes on event id
  (`webhook_events` table), upserts into `actions`.
- ⚠️ **Signature scheme unconfirmed** — `SIGNATURE_HEADER` in `src/webhooks/verify.ts`
  is a placeholder; confirm on the webhook-security reference. Until then use the
  shared-secret token in the postback URL (`?token=…`).
- **Enable in impact.com UI:** Settings → Postbacks/Integrations → add postback
  URL `https://<host>/postback?token=<WEBHOOK_SIGNING_SECRET>` and select action
  events. ⚠️ VERIFY the exact UI path + available macros.

## 8. Native Shopify vs API tracking (§4 ecom note)

We run Shopify stores. impact.com offers a **native Shopify integration** (pixel +
product-catalog feed) that is lower-effort and lower-latency than server-side API
tracking, but less flexible.

- **Recommendation:** use native Shopify tracking for standard online-sale
  conversions + catalog sync (fastest correct path), and reserve this API's
  conversion write-layer for cases native tracking can't cover — offline/phone
  orders, corrections/adjustments, server-authoritative dedupe, custom item
  attribution. Reconcile the two via `webhook_events` + `npm run reconcile`.
- ⚠️ Confirm the native integration's dedupe behaviour so API + native don't
  double-count the same order (both key on order id — keep order ids consistent).

## 9. MCP server (§5)

Official server at `https://mcp.impact.com/mcp` (OAuth 2.1 + PKCE). Not attempted
live here (egress blocked; public client_id "coming soon"). REST is the source of
truth for this build. Retry `claude mcp add --transport http impact
https://mcp.impact.com/mcp` from an allowed environment; if dynamic client
registration fails, note it and move on — never let MCP block the REST build.

## 10. Gotchas hit

- **Docs are agent-friendly but network-gated here** — the `.md`/`?ask=`/OpenAPI
  routes exist but were unreachable. Nothing was scraped; models are hand-written
  and flagged for OpenAPI regeneration.
- **Node built-in fetch + this sandbox's proxy:** Node's global `fetch` ignores
  `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21). Irrelevant once
  running where impact.com is directly reachable, but note it if you test from a
  proxied box.
