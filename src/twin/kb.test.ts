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

describe("loadKb — bundled KB flags only the still-unknown fields", () => {
  it("flags the genuinely-unknown fields (LinkedIn, salary, notice), not the filled or optional ones", () => {
    const { missing } = loadKb();
    // These come from the real CV → filled, not flagged.
    expect(missing).not.toContain("profile.email");
    expect(missing).not.toContain("profile.phone");
    // Not on the CV → still flagged.
    expect(missing).toContain("profile.linkedinUrl");
    expect(missing).toContain("screeningAnswers.salaryExpectation");
    expect(missing).toContain("screeningAnswers.noticePeriod");
    // Optional / not applicable to this profile.
    expect(missing).not.toContain("profile.pronouns");
    expect(missing).not.toContain("profile.githubUrl");
  });
});

describe("evaluateKb — filled fixture", () => {
  it("has no missing slots once the fixture fills them", () => {
    const { missing } = evaluateKb(fixtureKb());
    expect(missing).toHaveLength(0);
  });
});
