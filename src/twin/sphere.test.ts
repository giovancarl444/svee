import { describe, it, expect } from "vitest";
import { StagingSphere, planFromApproval } from "./sphere.js";
import { ApprovalRequiredError } from "./guardrails.js";
import type { ApprovalRequest } from "./contracts.js";

const submitApproval: ApprovalRequest = {
  id: "ap-1",
  type: "submit_application",
  company: "Acme",
  role: "Full-stack Engineer",
  url: "https://boards.greenhouse.io/acme/jobs/1",
  channel: "ats:greenhouse",
  cv_variant: "A",
  cover_letter: "Re: ...",
  screening_answers: [{ q: "Salary?", a: "45–60k SEK/mo" }],
  missing_fields: [],
  fit_score: 88,
  action_on_approve: "Review the staged package, then click the final Submit on ats:greenhouse.",
};

const followupApproval: ApprovalRequest = {
  id: "ap-2",
  type: "send_followup",
  company: "Acme",
  role: "Full-stack Engineer",
  url: "",
  channel: "email:gmail",
  cv_variant: null,
  cover_letter: "Following up on my application…",
  screening_answers: [],
  missing_fields: [],
  fit_score: 0,
  action_on_approve: "Review the draft, then send the email (gmail).",
};

describe("planFromApproval", () => {
  it("maps an application approval to a structured plan", () => {
    const p = planFromApproval(submitApproval);
    expect(p.action).toBe("submit_application");
    expect(p.channel).toBe("ats:greenhouse");
    expect(p.target.url).toBe(submitApproval.url);
    expect(p.payload.coverLetter).toBe("Re: ...");
    expect(p.payload.cvVariant).toBe("A");
    expect(p.payload.screeningAnswers).toHaveLength(1);
  });

  it("maps a follow-up approval to a message plan", () => {
    const p = planFromApproval(followupApproval);
    expect(p.channel).toBe("email:gmail");
    expect(p.payload.message).toBe("Following up on my application…");
    expect(p.payload.coverLetter).toBeUndefined();
  });
});

describe("StagingSphere — the inert twin-side executor", () => {
  const sphere = new StagingSphere();

  it("refuses to act on an unapproved plan", async () => {
    await expect(
      sphere.execute(planFromApproval(submitApproval), { approved: false, live: true }),
    ).rejects.toBeInstanceOf(ApprovalRequiredError);
  });

  it("never performs the final action, even approved + live — only hands off", async () => {
    const res = await sphere.execute(planFromApproval(submitApproval), { approved: true, live: true });
    expect(res.performed).toBe(false);
    expect(res.ok).toBe(true);
    expect(res.note).toMatch(/hand off to Sphere/i);
  });

  it("marks stage-only in the note when not live", async () => {
    const res = await sphere.execute(planFromApproval(followupApproval), { approved: true, live: false });
    expect(res.note).toMatch(/stage-only/i);
  });
});
