import { describe, it, expect } from "vitest";
import { handlePostback, parseParams, postbackToAction } from "./handler.js";
import { verifyPostback, computeHmac, SIGNATURE_HEADER } from "./verify.js";
import { nullLogger } from "../client/logger.js";
import { testConfig } from "../test-support/http-fakes.js";
import type { Database, Row } from "../sync/db.js";

/** In-memory DB double: records webhook_events (with dedupe) and action upserts. */
function fakeDb() {
  const events = new Set<string>();
  const actions: Row[] = [];
  const db: Database = {
    async query<T = Row>(text: string, values: unknown[] = []): Promise<T[]> {
      if (text.includes("INSERT INTO webhook_events")) {
        const id = String(values[0]);
        if (events.has(id)) return [] as T[]; // ON CONFLICT DO NOTHING
        events.add(id);
        return [{ event_id: id }] as unknown as T[];
      }
      return [] as T[];
    },
    async upsert(_t, rows) {
      actions.push(...rows);
      return rows.length;
    },
    async close() {},
  };
  return { db, events, actions };
}

const secret = "s3cr3t-token";
const cfg = () => testConfig({ WEBHOOK_SIGNING_SECRET: secret, DB: "postgres", DATABASE_URL: "postgres://x" });

describe("verifyPostback", () => {
  it("accepts a matching shared-secret token", () => {
    const r = verifyPostback({ rawBody: "", headers: {}, providedToken: secret, secret });
    expect(r).toMatchObject({ ok: true, method: "token" });
  });
  it("rejects a wrong token", () => {
    expect(verifyPostback({ rawBody: "", headers: {}, providedToken: "nope", secret }).ok).toBe(false);
  });
  it("verifies an HMAC signature when the header is present", () => {
    const rawBody = "ActionId=1&Amount=10";
    const sig = computeHmac(rawBody, secret);
    expect(verifyPostback({ rawBody, headers: { [SIGNATURE_HEADER]: sig }, secret }).ok).toBe(true);
    expect(verifyPostback({ rawBody, headers: { [SIGNATURE_HEADER]: "bad" }, secret }).ok).toBe(false);
  });
  it("fails closed with no secret", () => {
    expect(verifyPostback({ rawBody: "", headers: {}, providedToken: "x", secret: undefined }).ok).toBe(false);
  });
});

describe("parseParams / postbackToAction", () => {
  it("merges query and form body", () => {
    const p = parseParams({
      method: "POST",
      rawBody: "Amount=10&State=APPROVED",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      query: { ActionId: "A1", token: "t" },
    });
    expect(p).toMatchObject({ ActionId: "A1", Amount: "10", State: "APPROVED", token: "t" });
  });
  it("maps macros to an Action", () => {
    const a = postbackToAction({ ActionId: "A1", SaleAmount: "42", ActionStatus: "PENDING", OrderId: "O1" });
    expect(a.Id).toBe("A1");
    expect(a.Amount).toBe("42");
    expect(a.State).toBe("PENDING");
    expect(a.OrderId).toBe("O1");
  });
});

describe("handlePostback", () => {
  it("rejects unauthorized postbacks (401)", async () => {
    const { db } = fakeDb();
    const res = await handlePostback(
      { method: "GET", rawBody: "", headers: {}, query: { ActionId: "A1", token: "wrong" } },
      { db, config: cfg(), logger: nullLogger },
    );
    expect(res.status).toBe(401);
  });

  it("verifies, dedupes on event id, and upserts the action", async () => {
    const { db, actions } = fakeDb();
    const req = {
      method: "GET" as const,
      rawBody: "",
      headers: {},
      query: { ActionId: "A1", Amount: "10", State: "APPROVED", token: secret },
    };
    const first = await handlePostback(req, { db, config: cfg(), logger: nullLogger });
    expect(first).toMatchObject({ status: 200, body: { ok: true, duplicate: false } });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.id).toBe("A1");

    // Replayed postback (same event id) must NOT double-count.
    const second = await handlePostback(req, { db, config: cfg(), logger: nullLogger });
    expect(second.body.duplicate).toBe(true);
    expect(actions).toHaveLength(1);
  });

  it("acknowledges without persisting when DB=none", async () => {
    const { db, actions } = fakeDb();
    const res = await handlePostback(
      { method: "GET", rawBody: "", headers: {}, query: { ActionId: "A9", token: secret } },
      { db, config: testConfig({ WEBHOOK_SIGNING_SECRET: secret }), logger: nullLogger },
    );
    expect(res.body).toMatchObject({ ok: true, persisted: false });
    expect(actions).toHaveLength(0);
  });
});
