import { describe, it, expect } from "vitest";
import { selectChannel, detectAtsVendor } from "./channel.js";
import { makeFacts } from "./test-support.js";

describe("detectAtsVendor", () => {
  it("recognizes common ATS hosts", () => {
    expect(detectAtsVendor("https://boards.greenhouse.io/acme/jobs/1")).toBe("greenhouse");
    expect(detectAtsVendor("https://jobs.lever.co/acme/1")).toBe("lever");
    expect(detectAtsVendor("https://acme.ashbyhq.com/x")).toBe("ashby");
    expect(detectAtsVendor("https://acme.teamtailor.com/jobs/1")).toBe("teamtailor");
    expect(detectAtsVendor("https://example.com")).toBeUndefined();
  });
});

describe("selectChannel", () => {
  it("prefers the ATS/company page → submit_application", () => {
    const d = selectChannel(makeFacts({ applyMethod: "ats" }));
    expect(d.approvalType).toBe("submit_application");
    expect(d.atsVendor).toBe("greenhouse");
    expect(d.channel).toBe("ats:greenhouse");
  });

  it("routes email applications → send_email", () => {
    const d = selectChannel(makeFacts({ applyMethod: "email", applyEmail: "jobs@acme.com" }));
    expect(d.approvalType).toBe("send_email");
    expect(d.note).toContain("jobs@acme.com");
  });

  it("routes LinkedIn Easy Apply → linkedin_easy_apply (human-approved)", () => {
    const d = selectChannel(makeFacts({ applyMethod: "linkedin_easy_apply", url: "https://linkedin.com/jobs/1" }));
    expect(d.approvalType).toBe("linkedin_easy_apply");
    expect(d.note).toMatch(/never automate login\/submit/i);
  });

  it("follows a LinkedIn external link to the real ATS", () => {
    const d = selectChannel(
      makeFacts({ applyMethod: "linkedin_external", url: "https://jobs.lever.co/acme/1" }),
    );
    expect(d.approvalType).toBe("submit_application");
    expect(d.atsVendor).toBe("lever");
  });
});
