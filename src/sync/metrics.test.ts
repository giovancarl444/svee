import { describe, it, expect } from "vitest";
import { epc, conversionRate } from "./metrics.js";

describe("metric math", () => {
  it("epc = revenue / clicks", () => {
    expect(epc(100, 50)).toBe(2);
  });
  it("epc guards divide-by-zero", () => {
    expect(epc(100, 0)).toBe(0);
  });
  it("conversionRate = actions / clicks", () => {
    expect(conversionRate(10, 100)).toBeCloseTo(0.1);
  });
  it("conversionRate guards divide-by-zero", () => {
    expect(conversionRate(5, 0)).toBe(0);
  });
});
