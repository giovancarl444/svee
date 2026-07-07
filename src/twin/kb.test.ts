import { describe, it, expect } from "vitest";
import { loadKb, evaluateKb, collectMissingSlots } from "./kb.js";
import { fixtureKb } from "./test-support.js";

describe("collectMissingSlots", () => {
  it("finds empty and <<slot>> string leaves, ignores filled ones", () => {
    const missing = collectMissingSlots({ a: "ok", b: "", c: "<<fill me>>", d: { e: ["ok", "<<x>>"] } });
    expect(missing).toContain("b");
    expect(missing).toContain("c");
    expect(missing).toContain("d.e[1]");
    expect(missing).not.toContain("a");
  });
});

describe("loadKb — bundled KB flags unfilled slots", () => {
  it("flags the genuinely-unknown personal fields, not the optional ones", () => {
    const { missing } = loadKb();
    expect(missing).toContain("profile.email");
    expect(missing).toContain("profile.phone");
    expect(missing).toContain("screeningAnswers.salaryExpectation");
    expect(missing).not.toContain("profile.pronouns"); // optional-blank
  });
});

describe("evaluateKb — filled fixture", () => {
  it("has no missing slots once the fixture fills them", () => {
    const { missing } = evaluateKb(fixtureKb());
    expect(missing).toHaveLength(0);
  });
});
