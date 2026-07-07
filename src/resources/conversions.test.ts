import { describe, it, expect } from "vitest";
import { ImpactClient } from "../client/impact-client.js";
import { hashEmail } from "../util/hash.js";
import { fakeDeps, testConfig } from "../test-support/http-fakes.js";

const order = {
  orderId: "ORDER-1001",
  campaignId: "C1",
  actionTrackerId: "AT1",
  amount: 100,
};

describe("ConversionsResource (dry-run default)", () => {
  it("does NOT hit the network in dry-run and logs the request", async () => {
    const { deps, calls } = fakeDeps([]); // any fetch call would throw
    const client = new ImpactClient(testConfig(), deps);
    const res = await client.conversions.submitOrder(order);
    expect(res.dryRun).toBe(true);
    expect(calls).toHaveLength(0);
    expect(res.request.form.OrderId).toBe("ORDER-1001");
    expect(res.request.form.Amount).toBe("100.00");
    expect(res.request.form.CurrencyCode).toBe("SEK");
  });

  it("derives a stable idempotency key from account+tracker+order", async () => {
    const { deps } = fakeDeps([]);
    const client = new ImpactClient(testConfig(), deps);
    const a = await client.conversions.submitOrder(order);
    const b = await client.conversions.submitOrder(order);
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.idempotencyKey).toMatch(/^[a-f0-9]{40}$/); // sha1 hex
  });

  it("expands item-level line items and sums the amount", async () => {
    const { deps } = fakeDeps([]);
    const client = new ImpactClient(testConfig(), deps);
    const res = await client.conversions.submitItems({
      orderId: "O2",
      campaignId: "C1",
      actionTrackerId: "AT1",
      items: [
        { sku: "A", quantity: 2, unitPrice: 10 },
        { sku: "B", quantity: 1, unitPrice: 5 },
      ],
    });
    expect(res.request.form.Amount).toBe("25.00");
    expect(res.request.form.ItemSku1).toBe("A");
    expect(res.request.form.ItemSku2).toBe("B");
    expect(res.request.form.ItemSubTotal1).toBe("20.00");
  });

  it("hashes customer email and never exposes the raw value", async () => {
    const { deps } = fakeDeps([]);
    const client = new ImpactClient(testConfig(), deps);
    const res = await client.conversions.submitOrder({ ...order, customerEmail: "Person@Example.com" });
    const serialized = JSON.stringify(res.request);
    expect(serialized).not.toContain("Person@Example.com");
    expect(serialized).not.toContain("person@example.com");
    // The logged form value is redacted, but the true hash is deterministic.
    expect(hashEmail("Person@Example.com")).toMatch(/^[a-f0-9]{40}$/);
  });
});

describe("ConversionsResource (--live)", () => {
  it("POSTs a form-encoded body when live", async () => {
    const { deps, calls } = fakeDeps([{ status: 200, json: { Status: "OK" } }]);
    const client = new ImpactClient(testConfig({ IMPACT_LIVE: "1" }), deps);
    const res = await client.conversions.submitOrder(order);
    expect(res.dryRun).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(calls[0]!.body).toContain("OrderId=ORDER-1001");
  });
});
