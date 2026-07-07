/**
 * Shared test fixtures for the twin: a fully-filled KB (no `<<slots>>`) and a
 * RoleFacts builder with strong-role defaults. Kept out of *.test.ts so multiple
 * suites can share it.
 */
import type { KnowledgeBase } from "./kb.schema.js";
import { SVEE_KB } from "./kb.data.js";
import type { RoleFacts } from "./facts.js";

/** A clone of the bundled KB with every `<<slot>>` filled — for happy-path tests. */
export function fixtureKb(): KnowledgeBase {
  const kb = JSON.parse(JSON.stringify(SVEE_KB)) as KnowledgeBase;
  kb.profile.email = "svee@example.com";
  kb.profile.phone = "+46700000000";
  kb.profile.linkedinUrl = "https://linkedin.com/in/svee";
  kb.profile.githubUrl = "https://github.com/svee";
  kb.profile.personalSite = "https://svee.dev";
  kb.profile.availability = "2 weeks";
  kb.screeningAnswers.salaryExpectation = "45,000–60,000 SEK/mo";
  kb.screeningAnswers.salaryFloor = "45,000 SEK/mo";
  kb.screeningAnswers.noticePeriod = "2 weeks";
  return kb;
}

/** A strong, remote, ATS-hosted full-stack role. Override any field. */
export function makeFacts(partial: Partial<RoleFacts> = {}): RoleFacts {
  return {
    company: "Acme",
    role: "Full-stack Engineer",
    url: "https://boards.greenhouse.io/acme/jobs/1",
    source: "test",
    requiredSkills: ["TypeScript", "Next.js", "Supabase", "Postgres", "Vercel"],
    roleFamily: null, // realistic parsed default; family is inferred from the role text

    seniority: "mid",
    yearsRequired: null,
    mandatoryCredential: null,
    location: "Remote (EU)",
    workMode: "remote",
    onsite: false,
    compMin: null,
    compType: "salary",
    companySignal: "good",
    effort: "easy",
    industry: null,
    descriptionText:
      "We build with TypeScript, Next.js, Supabase and Postgres on Vercel. Fully remote across the EU.",
    screeningQuestions: [],
    applyMethod: "ats",
    ...partial,
  };
}
