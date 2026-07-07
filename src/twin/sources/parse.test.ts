import { describe, it, expect } from "vitest";
import { parseListing, extractSkills } from "./parse.js";

describe("extractSkills", () => {
  it("pulls a tech vocabulary out of free text", () => {
    const s = extractSkills("We use TypeScript, React and Postgres with some Python.");
    expect(s).toContain("typescript");
    expect(s).toContain("react");
    expect(s).toContain("postgres");
    expect(s).toContain("python");
  });
});

describe("parseListing — heuristics", () => {
  it("derives facts from a text blob", () => {
    const f = parseListing({
      company: "Acme",
      role: "Senior Backend Engineer",
      url: "https://boards.greenhouse.io/acme/jobs/9",
      text:
        "Senior role. 6+ years required. Fully remote. Master's degree required. " +
        "We use TypeScript and Postgres. Take-home coding challenge involved.",
    });
    expect(f.seniority).toBe("senior");
    expect(f.yearsRequired).toBe(6);
    expect(f.workMode).toBe("remote");
    expect(f.mandatoryCredential).toMatch(/degree/i);
    expect(f.effort).toBe("heavy");
    expect(f.applyMethod).toBe("ats");
    expect(f.atsVendor ?? "greenhouse").toBe("greenhouse");
  });

  it("detects unpaid and on-site", () => {
    const f = parseListing({ text: "Unpaid internship, on-site only in Berlin." });
    expect(f.compType).toBe("unpaid");
    expect(f.onsite).toBe(true);
  });

  it("parses SEK compensation", () => {
    const f = parseListing({ text: "Salary 55000 SEK per month." });
    expect(f.compMin).toBe(55000);
    expect(f.compCurrency).toBe("SEK");
  });

  it("lets structured facts override heuristics", () => {
    const f = parseListing({
      text: "on-site only",
      facts: { workMode: "remote", onsite: false, companySignal: "good", role: "Founding Engineer" },
    });
    expect(f.workMode).toBe("remote");
    expect(f.onsite).toBe(false);
    expect(f.companySignal).toBe("good");
    expect(f.role).toBe("Founding Engineer");
  });
});
