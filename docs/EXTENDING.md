# Adding a new endpoint in < 10 minutes

The client is built from small primitives so new endpoints are a copy-paste plus
one wire-up line. Here's the whole playbook.

## The primitives you get for free

- **Auth, retry, backoff, timeout, logging** — `ctx.http.get/post/...`
- **Pagination** — `paginate(ctx.http, path, { dataKey })` → async iterator
- **Deferred jobs** — `runDeferredExport(ctx.http, submitPath, opts)`
- **Path building** — `ctx.path("Segment", id)` → `/Advertisers/{SID}/Segment/{id}`
- **Typed models** — add to `src/types/impact.ts` (or regenerate from OpenAPI)

## 1. Verify the endpoint first (§3.2 — never guess)

```bash
# markdown twin of the reference page:
curl "https://integrations.impact.com/<persona>-api-reference/reference/<res>.md"
# or ask it directly:
curl "https://integrations.impact.com/rest-apis/api-quick-start.md?ask=<question>"
```

Record the confirmed path + fields in `docs/INTEGRATION_NOTES.md` §4.

## 2. Add a resource module

`src/resources/deals.ts`:

```ts
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import type { Deal } from "../types/impact.js";

export class DealsResource {
  constructor(private readonly ctx: ImpactContext) {}

  iterate() {
    return paginate<Deal>(this.ctx.http, this.ctx.path("Deals"), { dataKey: "Deals" });
  }
  async list(): Promise<Deal[]> {
    return collect(this.iterate());
  }
}
```

For a **write** endpoint, gate it on `this.ctx.config.live` and log the dry-run
request (copy the pattern in `resources/promo-codes.ts`).

## 3. Wire it into the façade

In `src/client/impact-client.ts`:

```ts
import { DealsResource } from "../resources/deals.js";
// ...
readonly deals: DealsResource;
// in the constructor:
this.deals = new DealsResource(this.context);
```

## 4. Test it (mocked — no network)

Use the fakes in `src/test-support/http-fakes.ts`:

```ts
const { deps } = fakeDeps([{ json: { Deals: [{ Id: "1" }] } }]);
const client = new ImpactClient(testConfig(), deps);
expect(await client.deals.list()).toHaveLength(1);
```

## 5. (If it feeds the warehouse) add a mapper + upsert + table

- table in `src/sync/schema.sql` (natural-key PK, `raw jsonb`, `synced_at`)
- mapper in `src/sync/mappers.ts` (pure, total, natural-key-first)
- upsert wrapper in `src/sync/upserts.ts`
- a stage in `src/sync/sync.ts`

Done. `npm run typecheck && npm test` should stay green.
