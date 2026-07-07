import { describe, it, expect } from "vitest";
import {
  scoreRole,
  classifyFamily,
  hardFilter,
  normalizeSkill,
  kbSkillTokens,
  DEFAULT_WEIGHTS,
} from "./scoring.js";
import { fixtureKb, makeFacts } from "./test-support.js";

const kb = fixtureKb();
const opts = { threshold: 68, weights: DEFAULT_WEIGHTS, salaryFloor: null };

describe("normalizeSkill", () => {
  it("normalizes separators and applies synonyms", () => {
    expect(normalizeSkill("Next.js")).toBe("next");
    expect(normalizeSkill("TypeScript")).toBe("typescript");
    expect(normalizeSkill("TS")).toBe("typescript");
    expect(normalizeSkill("PostgreSQL")).toBe("postgres");
  });
});

describe("scoreRole — strong role", () => {
  it("scores a strong remote full-stack role into 'prioritize' and passes", () => {
    const r = scoreRole(makeFacts(), kb, opts);
    expect(r.hardFilter).toBeNull();
    expect(r.pass).toBe(true);
    expect(r.tier).toBe("prioritize");
    expect(r.score).toBeGreaterThanOrEqual(80);
    // 5/5 skills recognized.
    expect(r.matchedSkills.length).toBe(5);
  });

  it("treats unknown comp as neutral (never discards on unknown comp)", () => {
    const r = scoreRole(makeFacts({ compMin: null }), kb, { ...opts, salaryFloor: 45000 });
    expect(r.hardFilter).toBeNull();
    expect(r.breakdown.comp).toBeCloseTo(0.6 * DEFAULT_WEIGHTS.comp);
  });
});

describe("scoreRole — hard filters auto-reject", () => {
  it("rejects a mandatory credential Svee lacks", () => {
    const r = scoreRole(makeFacts({ mandatoryCredential: "university degree" }), kb, opts);
    expect(r.hardFilter).toMatch(/credential/i);
    expect(r.pass).toBe(false);
    expect(r.score).toBe(0);
  });

  it("rejects on-site in an un-relocatable location", () => {
    const r = scoreRole(makeFacts({ onsite: true, location: "Berlin", workMode: "onsite" }), kb, opts);
    expect(r.hardFilter).toMatch(/on-site/i);
    expect(r.pass).toBe(false);
  });

  it("accepts on-site in the Stockholm area (relocateTo)", () => {
    const r = scoreRole(
      makeFacts({ onsite: true, location: "Stockholm office", workMode: "onsite" }),
      kb,
      opts,
    );
    expect(r.hardFilter).toBeNull();
  });

  it("rejects unpaid and commission-only", () => {
    expect(scoreRole(makeFacts({ compType: "unpaid" }), kb, opts).hardFilter).toMatch(/unpaid/i);
    expect(scoreRole(makeFacts({ compType: "commission_only" }), kb, opts).hardFilter).toMatch(/commission/i);
  });

  it("rejects a dealbreaker industry", () => {
    const r = scoreRole(
      makeFacts({ descriptionText: "We are a data-broker surveillance adtech company." }),
      kb,
      opts,
    );
    expect(r.hardFilter).toMatch(/dealbreaker/i);
  });

  it("rejects comp visibly below the floor", () => {
    const r = scoreRole(makeFacts({ compMin: 20000, compCurrency: "SEK" }), kb, { ...opts, salaryFloor: 45000 });
    expect(r.hardFilter).toMatch(/comp below floor/i);
  });

  it("does NOT reject foreign-currency comp against a SEK floor (incomparable units)", () => {
    const r = scoreRole(makeFacts({ compMin: 30000, compCurrency: "USD" }), kb, { ...opts, salaryFloor: 45000 });
    expect(r.hardFilter).toBeNull();
    expect(r.breakdown.comp).toBeCloseTo(0.6 * DEFAULT_WEIGHTS.comp); // neutral
  });

  it("an empty credential entry does not silently disable the mandatory-credential filter", () => {
    const kbEmptyCred = { ...kb, profile: { ...kb.profile, credentials: [""] } };
    const r = scoreRole(makeFacts({ mandatoryCredential: "university degree" }), kbEmptyCred, opts);
    expect(r.hardFilter).toMatch(/credential/i);
  });

  it("rejects an obvious scam pattern", () => {
    const r = scoreRole(makeFacts({ descriptionText: "Pay a small registration fee to apply." }), kb, opts);
    expect(r.hardFilter).toMatch(/scam/i);
  });
});

describe("scoreRole — seniority realism", () => {
  it("penalizes a senior role above the band and 5+ years", () => {
    const mid = scoreRole(makeFacts({ seniority: "mid" }), kb, opts).breakdown.seniority;
    const senior = scoreRole(makeFacts({ seniority: "senior", yearsRequired: 8 }), kb, opts).breakdown.seniority;
    expect(senior).toBeLessThan(mid);
    expect(senior).toBe(0);
  });
});

describe("classifyFamily", () => {
  it("classifies primary / also / not / unknown", () => {
    expect(classifyFamily(makeFacts({ role: "AI Agent Engineer" }), kb)).toBe("primary");
    expect(classifyFamily(makeFacts({ role: "Backend Engineer" }), kb)).toBe("also");
    expect(classifyFamily(makeFacts({ role: "Manual QA Tester" }), kb)).toBe("not");
    expect(classifyFamily(makeFacts({ role: "Underwater Basket Weaver" }), kb)).toBe("unknown");
  });

  it("a 'not' role scores low and is discarded", () => {
    const r = scoreRole(makeFacts({ role: "Manual QA Tester", requiredSkills: [] }), kb, opts);
    expect(r.tier).toBe("discard");
    expect(r.pass).toBe(false);
  });
});

describe("kbSkillTokens", () => {
  it("collects normalized KB skill tokens", () => {
    const tokens = kbSkillTokens(kb);
    expect(tokens.has("typescript")).toBe(true);
    expect(tokens.has("next")).toBe(true);
  });
});

describe("hardFilter", () => {
  it("returns null for a clean role", () => {
    expect(hardFilter(makeFacts(), kb, null)).toBeNull();
  });
});
