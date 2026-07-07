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

  it("parses SEK compensation without a phantom k×1000", () => {
    const f = parseListing({ text: "Salary 55000 SEK per month." });
    expect(f.compMin).toBe(55000);
    expect(f.compCurrency).toBe("SEK");
    expect(parseListing({ text: "45000 kr / month" }).compMin).toBe(45000); // "kr" ≠ ×1000
  });

  it("takes the lower bound of a k-suffixed range (€40-55k → 40000)", () => {
    const f = parseListing({ text: "Comp €40-55k depending on experience." });
    expect(f.compMin).toBe(40000);
    expect(f.compCurrency).toBe("EUR");
  });

  it("does not inject phantom skills from common English words", () => {
    const s = extractSkills("React developer, remote available, interested candidates email us.");
    expect(s).toEqual(["react"]); // not ['react','ai','rest']
  });

  it("prefers the ATS host over an application email (channel preference)", () => {
    const f = parseListing({
      url: "https://boards.greenhouse.io/acme/jobs/1",
      applyEmail: "jobs@acme.com",
      text: "Apply now.",
    });
    expect(f.applyMethod).toBe("ats");
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
