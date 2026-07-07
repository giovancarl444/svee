import { describe, it, expect } from "vitest";
import { evaluatePartner, DEFAULT_THRESHOLDS, type WindowMetric } from "./alerts.js";

const base = (o: Partial<WindowMetric>): WindowMetric => ({
  mediaId: "M1",
  name: "Acme",
  clicks: 0,
  actions: 0,
  revenue: 0,
  reversed: 0,
  ...o,
});

describe("evaluatePartner — EPC drop", () => {
  it("fires when EPC falls beyond the threshold and prior revenue is material", () => {
    const prev = base({ clicks: 100, revenue: 200 }); // EPC 2.0
    const curr = base({ clicks: 100, revenue: 50 }); // EPC 0.5 → -75%
    const alerts = evaluatePartner(prev, curr, DEFAULT_THRESHOLDS);
    expect(alerts.map((a) => a.kind)).toContain("epc_drop");
    expect(alerts.find((a) => a.kind === "epc_drop")!.severity).toBe("warn");
  });

  it("escalates to critical on a >=80% drop", () => {
    const prev = base({ clicks: 100, revenue: 500 }); // EPC 5
    const curr = base({ clicks: 100, revenue: 50 }); // EPC 0.5 → -90%
    const alert = evaluatePartner(prev, curr, DEFAULT_THRESHOLDS).find((a) => a.kind === "epc_drop")!;
    expect(alert.severity).toBe("critical");
  });

  it("does not fire when prior revenue is immaterial", () => {
    const prev = base({ clicks: 100, revenue: 20 }); // below minPriorRevenue
    const curr = base({ clicks: 100, revenue: 1 });
    expect(evaluatePartner(prev, curr, DEFAULT_THRESHOLDS).some((a) => a.kind === "epc_drop")).toBe(false);
  });
});

describe("evaluatePartner — reversal spike", () => {
  it("fires when reversed/total exceeds the ratio", () => {
    const curr = base({ actions: 10, reversed: 5 }); // 50%
    const alert = evaluatePartner(base({}), curr, DEFAULT_THRESHOLDS).find((a) => a.kind === "reversal_spike")!;
    expect(alert.severity).toBe("warn");
  });

  it("escalates to critical past 60%", () => {
    const curr = base({ actions: 10, reversed: 7 });
    const alert = evaluatePartner(base({}), curr, DEFAULT_THRESHOLDS).find((a) => a.kind === "reversal_spike")!;
    expect(alert.severity).toBe("critical");
  });

  it("ignores low-volume partners", () => {
    const curr = base({ actions: 3, reversed: 3 });
    expect(evaluatePartner(base({}), curr, DEFAULT_THRESHOLDS).some((a) => a.kind === "reversal_spike")).toBe(false);
  });
});
