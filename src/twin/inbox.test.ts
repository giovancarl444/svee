import { describe, it, expect } from "vitest";
import { classifyReply, isSwedish } from "./inbox.js";

const msg = (body: string, subject = "") => ({ id: "m1", subject, body });

describe("classifyReply", () => {
  it("classifies an offer as critical", () => {
    const c = classifyReply(msg("We would like to offer you the position. Offer letter attached."));
    expect(c.kind).toBe("offer");
    expect(c.priority).toBe("critical");
  });

  it("classifies an interview request as high", () => {
    const c = classifyReply(msg("Are you available for an interview next week? Here's my Calendly."));
    expect(c.kind).toBe("interview_request");
    expect(c.priority).toBe("high");
  });

  it("classifies a recruiter screen as normal", () => {
    const c = classifyReply(msg("Quick chat — just a few questions to get to know you."));
    expect(c.kind).toBe("recruiter_screen");
  });

  it("classifies a rejection", () => {
    const c = classifyReply(msg("Unfortunately we've decided to proceed with other candidates."));
    expect(c.kind).toBe("rejection");
  });

  it("prefers offer over interview when both appear", () => {
    const c = classifyReply(msg("After the interview, we'd like to offer you the role."));
    expect(c.kind).toBe("offer");
  });

  it("handles Swedish", () => {
    const c = classifyReply(msg("Vi vill erbjuda dig tjänsten. Välkommen ombord!"));
    expect(c.kind).toBe("offer");
  });

  it("falls back to other", () => {
    expect(classifyReply(msg("Thanks for your application, we'll be in touch.")).kind).toBe("other");
  });
});

describe("isSwedish", () => {
  it("detects Swedish by diacritics and stopwords", () => {
    expect(isSwedish("Hej och tack för att du sökte")).toBe(true);
    expect(isSwedish("Thanks for applying to our team")).toBe(false);
  });
});
