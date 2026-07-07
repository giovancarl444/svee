import { describe, it, expect } from "vitest";
import {
  pickFamilyKind,
  pickCvVariant,
  deterministicCoverLetter,
  buildScreeningAnswers,
  unbackedMetrics,
  neverClaimViolations,
  wordCount,
  draftCoverLetter,
} from "./tailor.js";
import { fixtureKb, makeFacts } from "./test-support.js";
import { SVEE_KB } from "./kb.data.js";
import type { LlmClient } from "./llm.js";

const kb = fixtureKb();

describe("pickFamilyKind / pickCvVariant", () => {
  it("routes AI/agent roles to variant B", () => {
    const facts = makeFacts({ role: "AI Agent Engineer", descriptionText: "Build LLM agents and automation." });
    expect(pickFamilyKind(facts)).toBe("agents");
    expect(pickCvVariant(facts, kb)).toBe("B");
  });

  it("routes growth roles to variant C", () => {
    const facts = makeFacts({ role: "Growth Engineer", descriptionText: "Own attribution, affiliate and marketing." });
    expect(pickFamilyKind(facts)).toBe("growth");
    expect(pickCvVariant(facts, kb)).toBe("C");
  });

  it("defaults to full-stack variant A", () => {
    expect(pickCvVariant(makeFacts(), kb)).toBe("A");
  });
});

describe("deterministicCoverLetter", () => {
  it("names the company + role, cites a proof, stays under ~180 words", () => {
    const letter = deterministicCoverLetter(makeFacts({ company: "Nordic AB", role: "Full-stack Engineer" }), kb);
    expect(letter).toContain("Nordic AB");
    expect(letter).toContain("Full-stack Engineer");
    expect(letter).toContain("78"); // a real KB number
    expect(wordCount(letter)).toBeLessThanOrEqual(180);
  });
});

describe("unbackedMetrics (truth validator)", () => {
  it("passes numbers that are in the Achievement Bank and flags ones that aren't", () => {
    expect(unbackedMetrics("I wrote 78 unit tests.", kb)).toHaveLength(0);
    expect(unbackedMetrics("I wrote 5000 unit tests.", kb)).toEqual(["5000"]);
  });

  it("catches unit-suffixed fabricated metrics (no word boundary after the digit)", () => {
    const u = unbackedMetrics("We grew to 10k users, made it 3x faster, and hit 500rps.", kb);
    expect(u).toContain("10");
    expect(u).toContain("3");
    expect(u).toContain("500");
  });

  it("does not treat incidental KB digits (phone/dates) as backed metrics", () => {
    // The phone number is in the KB but NOT the Achievement Bank → still unbacked.
    expect(unbackedMetrics("Call 46700000000 for a reference.", kb)).toContain("46700000000");
  });
});

describe("neverClaimViolations", () => {
  it("flags a forbidden claim", () => {
    expect(neverClaimViolations("I hold a driver's licence.", kb)).not.toHaveLength(0);
  });
  it("clears a clean letter", () => {
    expect(neverClaimViolations(deterministicCoverLetter(makeFacts(), kb), kb)).toHaveLength(0);
  });
});

describe("buildScreeningAnswers", () => {
  it("maps mapped questions and flags unfilled ones", () => {
    const facts = makeFacts({
      screeningQuestions: ["What are your salary expectations?", "Do you need visa sponsorship?", "Notice period?"],
    });
    const r = buildScreeningAnswers(facts, kb);
    expect(r.missing).toHaveLength(0);
    expect(r.answers.map((a) => a.q)).toContain("Do you need visa sponsorship?");
    expect(r.answers.find((a) => /visa/i.test(a.q))!.a).toMatch(/No/i);
  });

  it("flags a KB slot that isn't filled (bundled KB has no salary numbers)", () => {
    const facts = makeFacts({ screeningQuestions: ["Salary expectations?"] });
    const r = buildScreeningAnswers(facts, SVEE_KB);
    expect(r.missing.some((m) => /Salary/i.test(m))).toBe(true);
  });

  it("flags an unmapped question", () => {
    const r = buildScreeningAnswers(makeFacts({ screeningQuestions: ["What is your favourite colour?"] }), kb);
    expect(r.missing[0]).toMatch(/Unmapped/i);
  });
});

describe("draftCoverLetter — truth-first LLM fallback", () => {
  it("uses the deterministic letter when no LLM is provided", async () => {
    const r = await draftCoverLetter(makeFacts(), kb);
    expect(r.source).toBe("deterministic");
  });

  it("drops an LLM draft that fabricates a metric", async () => {
    const liar: LlmClient = { async complete() { return "We shipped 9999 integrations for Acme."; } };
    const r = await draftCoverLetter(makeFacts(), kb, { llm: liar });
    expect(r.source).toBe("deterministic");
    expect(r.unbacked).toContain("9999");
  });

  it("keeps a clean LLM draft", async () => {
    const honest: LlmClient = {
      async complete() { return "For Acme: I built a typed integration with 78 unit tests. Happy to demo."; }
    };
    const r = await draftCoverLetter(makeFacts(), kb, { llm: honest });
    expect(r.source).toBe("llm");
    expect(r.unbacked).toHaveLength(0);
  });
});
