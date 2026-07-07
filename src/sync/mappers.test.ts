import { describe, it, expect } from "vitest";
import { actionToRow, clickToRow, partnerToRow, reportRowToDaily } from "./mappers.js";

describe("actionToRow", () => {
  it("maps and coerces fields, keeps raw", () => {
    const row = actionToRow({ Id: "A1", Amount: "42.50", Payout: "5", State: "APPROVED", OrderId: "O1", EventDate: "2026-01-02T03:04:05" })!;
    expect(row.id).toBe("A1");
    expect(row.amount).toBe(42.5);
    expect(row.payout).toBe(5);
    expect(row.state).toBe("APPROVED");
    expect(row.event_date).toBeInstanceOf(Date);
    expect(row.raw).toMatchObject({ Id: "A1" });
  });

  it("returns null when there is no id", () => {
    expect(actionToRow({ Amount: "1" })).toBeNull();
  });

  it("falls back to Status when State is absent", () => {
    expect(actionToRow({ Id: "A2", Status: "PENDING" })!.state).toBe("PENDING");
  });
});

describe("clickToRow", () => {
  it("uses DateTime when EventDate is absent", () => {
    const row = clickToRow({ Id: "C1", DateTime: "2026-01-02T00:00:00" })!;
    expect(row.event_date).toBeInstanceOf(Date);
  });
});

describe("partnerToRow", () => {
  it("resolves media id from several candidate fields", () => {
    expect(partnerToRow({ Id: "M1", Name: "Acme" })!.media_id).toBe("M1");
    expect(partnerToRow({ MediaId: "M2" })!.media_id).toBe("M2");
    expect(partnerToRow({})).toBeNull();
  });
});

describe("reportRowToDaily", () => {
  it("extracts date + numeric columns from candidate names", () => {
    const row = reportRowToDaily({ Date: "2026-01-05", Clicks: "120", Actions: "8", SaleAmount: "1000.50", MediaId: "M1" })!;
    expect(row.day).toBe("2026-01-05");
    expect(row.clicks).toBe(120);
    expect(row.actions).toBe(8);
    expect(row.revenue).toBe(1000.5);
    expect(row.media_id).toBe("M1");
  });

  it("returns null without a parseable date", () => {
    expect(reportRowToDaily({ Clicks: "1" })).toBeNull();
  });
});
