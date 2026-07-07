/**
 * Integration test against a REAL Postgres engine (PGlite = Postgres compiled to
 * WASM, in-process). This is the layer unit tests can't cover: it actually runs
 * schema.sql, buildUpsert, the metrics CTEs/joins, the retention purge, and the
 * webhook handler against Postgres — catching SQL errors that string-level tests
 * never would.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applySchema, buildUpsert, dedupeByConflict, type Database, type Row, type UpsertOptions } from "./db.js";
import { computeDashboardMetrics } from "./metrics.js";
import { purgeExpired } from "./retention.js";
import { upsertActions, upsertClicks, upsertPrograms, upsertMediaProperties, upsertDeals } from "./upserts.js";
import { handlePostback } from "../webhooks/handler.js";
import { testConfig } from "../test-support/http-fakes.js";
import { nullLogger } from "../client/logger.js";

/**
 * Normalize params the way node-postgres would: objects -> JSON (for jsonb),
 * Dates -> ISO (for timestamptz). `pg` does this implicitly; PGlite is stricter,
 * so we mirror `pg` here to keep the test faithful to production.
 */
function normParams(values: unknown[]): unknown[] {
  return values.map((v) => {
    if (v === null || v === undefined) return v;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") return JSON.stringify(v);
    return v;
  });
}

/** Database adapter backed by PGlite (real Postgres). */
class PgliteDatabase implements Database {
  constructor(private readonly pg: PGlite) {}
  async query<T = Row>(text: string, values: unknown[] = []): Promise<T[]> {
    // Multi-statement DDL (schema.sql) has no params -> use exec.
    if (values.length === 0 && text.split(";").filter((s) => s.trim()).length > 1) {
      await this.pg.exec(text);
      return [] as T[];
    }
    const res = await this.pg.query(text, normParams(values));
    return res.rows as T[];
  }
  async upsert(table: string, rows: Row[], conflictColumns: string[], options?: UpsertOptions): Promise<number> {
    if (rows.length === 0) return 0;
    const deduped = dedupeByConflict(rows, conflictColumns);
    const { text, values } = buildUpsert(table, deduped, conflictColumns, options);
    const res = await this.pg.query(text, normParams(values));
    return res.affectedRows ?? 0;
  }
  async close(): Promise<void> {
    await this.pg.close();
  }
}

let pg: PGlite;
let db: Database;

beforeAll(async () => {
  pg = new PGlite();
  db = new PgliteDatabase(pg);
  await applySchema(db); // exercises the real schema.sql
});

afterAll(async () => {
  await db.close();
});

describe("schema", () => {
  it("creates every expected table", async () => {
    const rows = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "sync_state", "partners", "contracts", "actions", "clicks", "catalog_items",
        "daily_performance", "programs", "media_properties", "deals", "webhook_events",
      ]),
    );
  });
});

describe("idempotent upserts against Postgres", () => {
  it("seeds actions/clicks/programs and re-running does not duplicate", async () => {
    const programs = [
      { CampaignId: "C1", Name: "Nordic Outdoor", AdvertiserName: "Nordic AB" },
      { CampaignId: "C2", Name: "Skincare Co", AdvertiserName: "Skincare AB" },
    ];
    const actions = [
      { Id: "A1", MediaId: "M1", CampaignId: "C1", State: "APPROVED", Amount: "100", Payout: "15", Currency: "SEK", EventDate: "2026-07-01", SubId1: "store-a" },
      { Id: "A2", MediaId: "M1", CampaignId: "C1", State: "APPROVED", Amount: "200", Payout: "30", Currency: "SEK", EventDate: "2026-07-02", SubId1: "store-a" },
      { Id: "A3", MediaId: "M1", CampaignId: "C2", State: "PENDING", Amount: "50", Currency: "SEK", EventDate: "2026-07-02", SubId1: "store-b" },
      { Id: "A4", MediaId: "M1", CampaignId: "C1", State: "REVERSED", Amount: "80", Currency: "SEK", EventDate: "2026-07-03", SubId1: "store-a" },
    ];
    const clicks = [
      { Id: "K1", MediaId: "M1", CampaignId: "C1", SubId1: "store-a", EventDate: "2026-07-01" },
      { Id: "K2", MediaId: "M1", CampaignId: "C1", SubId1: "store-a", EventDate: "2026-07-01" },
      { Id: "K3", MediaId: "M1", CampaignId: "C1", SubId1: "store-a", EventDate: "2026-07-02" },
      { Id: "K4", MediaId: "M1", CampaignId: "C2", SubId1: "store-b", EventDate: "2026-07-02" },
      { Id: "K5", MediaId: "M1", CampaignId: "C2", SubId1: "store-b", EventDate: "2026-07-02" },
    ];

    await upsertPrograms(db, programs);
    await upsertActions(db, actions);
    await upsertClicks(db, clicks);
    // Re-run everything — must be a no-op (idempotent).
    await upsertPrograms(db, programs);
    await upsertActions(db, actions);
    await upsertClicks(db, clicks);

    const a = await db.query<{ n: number }>("SELECT count(*)::int n FROM actions");
    const k = await db.query<{ n: number }>("SELECT count(*)::int n FROM clicks");
    expect(a[0]!.n).toBe(4);
    expect(k[0]!.n).toBe(5);

    // partner-only inventory
    await upsertMediaProperties(db, [{ Id: "MP1", Name: "friluft.se", Type: "WEBSITE", Status: "ACTIVE" }]);
    await upsertDeals(db, [{ Id: "D1", Name: "Summer 20%", CampaignId: "C1" }]);
    const mp = await db.query<{ n: number }>("SELECT count(*)::int n FROM media_properties");
    expect(mp[0]!.n).toBe(1);
  });

  it("buildUpsert survives a batch that repeats a natural key (dedupe last-wins)", async () => {
    // Two rows, same id, in ONE upsert — would crash Postgres without dedupe.
    await expect(
      upsertActions(db, [
        { Id: "DUP", MediaId: "M1", CampaignId: "C1", State: "PENDING", Amount: "10", EventDate: "2026-07-04" },
        { Id: "DUP", MediaId: "M1", CampaignId: "C1", State: "APPROVED", Amount: "99", EventDate: "2026-07-04" },
      ]),
    ).resolves.toBeGreaterThanOrEqual(1);
    const r = await db.query<{ state: string; amount: string }>("SELECT state, amount FROM actions WHERE id = 'DUP'");
    expect(r[0]!.state).toBe("APPROVED"); // last write won
  });
});

describe("computeDashboardMetrics against Postgres", () => {
  it("computes totals, funnel and breakdowns correctly", async () => {
    // Drop the DUP row from the previous dedupe test for a clean slate (A1..A4).
    await db.query("DELETE FROM actions WHERE id = 'DUP'");
    const m = await computeDashboardMetrics(db, { currency: "SEK", persona: "partner" });

    // Totals: approved 100+200 = 300; pending 50; reversed 80 (from A4).
    expect(m.totals.approvedValue).toBeCloseTo(300);
    expect(m.totals.pendingValue).toBeCloseTo(50);
    expect(m.totals.clicks).toBe(5);
    expect(m.totals.actions).toBe(4); // A1..A4
    expect(m.totals.reversalRate).toBeCloseTo(0.25); // 1 of 4

    // By program: C1 has the revenue and joins to its name.
    const c1 = m.topPrograms.find((p) => p.key === "C1");
    expect(c1?.name).toBe("Nordic Outdoor");
    expect(c1?.revenue).toBeCloseTo(300);

    // By SubId1 (the Shopify tracking dimension).
    const storeA = m.bySubId.find((s) => s.key === "store-a");
    expect(storeA?.revenue).toBeCloseTo(300);
    expect(storeA?.clicks).toBe(3);
    expect(storeA?.epc).toBeCloseTo(100); // 300 / 3

    // Partner inventory surfaces.
    expect(m.properties.some((p) => p.name === "friluft.se")).toBe(true);
    expect(m.deals.some((d) => d.name === "Summer 20%")).toBe(true);
  });

  it("reflects daily_performance in the trend", async () => {
    await db.query(
      `INSERT INTO daily_performance (day, campaign_id, clicks, actions, revenue, raw)
       VALUES (current_date - 1, 'C1', 3, 3, 300, '{}'), (current_date - 2, 'C2', 2, 1, 0, '{}')`,
    );
    const m = await computeDashboardMetrics(db, { currency: "SEK", persona: "partner" });
    expect(m.dailyTrend.length).toBeGreaterThanOrEqual(2);
    expect(m.dailyTrend.every((d) => typeof d.epc === "number")).toBe(true);
  });
});

describe("retention purge against Postgres", () => {
  it("deletes rows older than the TTL and keeps recent ones", async () => {
    await db.query(
      `INSERT INTO actions (id, media_id, event_date, raw) VALUES ('OLD', 'M1', current_date - 400, '{}')`,
    );
    const before = await db.query<{ n: number }>("SELECT count(*)::int n FROM actions");
    const purged = await purgeExpired(db, 395);
    const after = await db.query<{ n: number }>("SELECT count(*)::int n FROM actions");
    expect(purged.actions).toBe(1); // only the 400-day-old row
    expect(after[0]!.n).toBe(before[0]!.n - 1);
  });
});

describe("webhook handler against Postgres", () => {
  const cfg = testConfig({ DB: "postgres", DATABASE_URL: "x", WEBHOOK_SIGNING_SECRET: "sek", IMPACT_PERSONA: "partner" });

  it("verifies, upserts the action, dedupes replays, and never stores the token", async () => {
    const req = {
      method: "GET" as const,
      rawBody: "",
      headers: {},
      query: { ActionId: "PB1", CampaignId: "C1", State: "APPROVED", Amount: "42", SubId1: "store-a", token: "sek" },
    };
    const first = await handlePostback(req, { db, config: cfg, logger: nullLogger });
    expect(first.body).toMatchObject({ ok: true, duplicate: false });

    const action = await db.query<{ amount: string }>("SELECT amount FROM actions WHERE id = 'PB1'");
    expect(action).toHaveLength(1);

    const replay = await handlePostback(req, { db, config: cfg, logger: nullLogger });
    expect(replay.body.duplicate).toBe(true);

    const ev = await db.query<{ payload: unknown }>("SELECT payload FROM webhook_events WHERE event_id = 'PB1'");
    expect(ev).toHaveLength(1);
    expect(JSON.stringify(ev[0]!.payload)).not.toContain("sek"); // token stripped at ingest
  });

  it("rejects an unauthorized postback (401), persisting nothing", async () => {
    const res = await handlePostback(
      { method: "GET", rawBody: "", headers: {}, query: { ActionId: "PB2", token: "wrong" } },
      { db, config: cfg, logger: nullLogger },
    );
    expect(res.status).toBe(401);
    const action = await db.query<{ n: number }>("SELECT count(*)::int n FROM actions WHERE id = 'PB2'");
    expect(action[0]!.n).toBe(0);
  });
});
