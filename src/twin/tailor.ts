/**
 * TAILORING (spec §"THE DAILY LOOP" step 3 + §"COVER LETTER / OUTREACH RULES").
 *
 * Everything here is KB-bound: the CV variant, the cover-letter components, and
 * the screening answers all come from the Knowledge Base and nowhere else. The
 * truth validator (`unbackedMetrics`) is the code-layer enforcement of "Metrics
 * must be traceable to the KB's Achievement Bank. No new numbers." — a live LLM
 * draft that cites a number not in the KB is rejected in favour of the
 * deterministic, provably-KB-bound template.
 */
import type { KnowledgeBase, CvFamily } from "./kb.schema.js";
import type { RoleFacts } from "./facts.js";
import type { LlmClient } from "./llm.js";

export type FamilyKind = "fullstack" | "agents" | "growth";

const AGENT_WORDS = ["ai", "agent", "agents", "ml", "llm", "genai", "automation", "rag", "prompt"];
const GROWTH_WORDS = [
  "growth", "revops", "martech", "affiliate", "marketing", "seo", "lifecycle", "attribution", "crm",
];

function textBag(facts: RoleFacts): string {
  return `${facts.role} ${facts.roleFamily ?? ""} ${facts.requiredSkills.join(" ")} ${facts.descriptionText}`.toLowerCase();
}

/** Which family of Svee's work does this role most resemble? Drives CV + proof. */
export function pickFamilyKind(facts: RoleFacts): FamilyKind {
  const bag = textBag(facts);
  const count = (words: string[]) =>
    words.reduce((n, w) => n + (new RegExp(`\\b${w}\\b`, "i").test(bag) ? 1 : 0), 0);
  const agents = count(AGENT_WORDS);
  const growth = count(GROWTH_WORDS);
  if (growth > agents && growth > 0) return "growth";
  if (agents > 0) return "agents";
  return "fullstack";
}

/** CV variant by family: A full-stack, B agents/automation, C growth/martech. */
export function pickCvVariant(facts: RoleFacts, kb: KnowledgeBase): CvFamily | null {
  const kind = pickFamilyKind(facts);
  const wanted: CvFamily = kind === "agents" ? "B" : kind === "growth" ? "C" : "A";
  const have = kb.cvVariants.find((v) => v.id === wanted);
  if (have) return wanted;
  return kb.cvVariants[0]?.id ?? null;
}

// ── Cover letter ─────────────────────────────────────────────────────────────

function hookFor(kind: FamilyKind, kb: KnowledgeBase): string {
  return kb.letterComponents.hooks[kind] ?? Object.values(kb.letterComponents.hooks)[0] ?? "";
}

function proofFor(kind: FamilyKind, kb: KnowledgeBase): string {
  if (kind === "agents") return kb.letterComponents.proofAgents;
  if (kind === "growth") return kb.letterComponents.proofGrowth;
  return kb.letterComponents.proofFullStack;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Deterministic, provably-KB-bound cover letter. Structure per the spec:
 * (1) one line on why THIS company/role; (2) the single most relevant proof with
 * a number; (3) one line of working-style fit; (4) a direct close. ≤ ~180 words.
 */
export function deterministicCoverLetter(facts: RoleFacts, kb: KnowledgeBase): string {
  const kind = pickFamilyKind(facts);
  const hook = hookFor(kind, kb);
  const proof = proofFor(kind, kb);
  const style = kb.letterComponents.workingStyle;
  const close = kb.letterComponents.close;

  const opener = `Re: ${facts.role} at ${facts.company} — ${hook}`;
  const body = `${proof} ${style}`;
  return `${opener}\n\n${body}\n\n${close}`.trim();
}

// ── Truth validator ──────────────────────────────────────────────────────────

const NUMBER_RE = /\b\d[\d.,]*\b/g;

/** Every number token that appears anywhere in the KB (the allowed universe). */
export function kbNumberTokens(kb: KnowledgeBase): Set<string> {
  const tokens = JSON.stringify(kb).match(NUMBER_RE) ?? [];
  return new Set(tokens.map((t) => t.replace(/[.,]+$/, "")));
}

/**
 * Numbers a draft cites that are NOT backed by the KB. A non-empty result means
 * the draft must not ship as-is (fabricated metric). Bare years like a 4-digit
 * date and the age "20" are tolerated only if present in the KB already.
 */
export function unbackedMetrics(text: string, kb: KnowledgeBase): string[] {
  const allowed = kbNumberTokens(kb);
  const found = text.match(NUMBER_RE) ?? [];
  const unbacked: string[] = [];
  for (const raw of found) {
    const n = raw.replace(/[.,]+$/, "");
    if (!allowed.has(n)) unbacked.push(n);
  }
  return [...new Set(unbacked)];
}

/** Any `neverClaim` phrase asserted in the draft (case-insensitive substring). */
export function neverClaimViolations(text: string, kb: KnowledgeBase): string[] {
  const lc = text.toLowerCase();
  return kb.preferences.neverClaim.filter((c) => {
    // Match on the distinctive noun of the claim, not the whole sentence.
    const key = c.toLowerCase().replace(/^(a |an |any )/, "");
    return lc.includes(key.split(" ").slice(0, 3).join(" "));
  });
}

// ── Screening answers ────────────────────────────────────────────────────────

export interface ScreeningResult {
  answers: Array<{ q: string; a: string }>;
  /** Questions the KB can't answer (unfilled slot or unmapped) → needs a human. */
  missing: string[];
}

interface Resolver {
  match: RegExp;
  resolve: (kb: KnowledgeBase) => string;
}

const RESOLVERS: Resolver[] = [
  { match: /salary|compensation|\blön\b|pay|comp\b|remuneration/i, resolve: (kb) => kb.screeningAnswers.salaryExpectation },
  { match: /notice|start date|available to start|tillträd|uppsägning/i, resolve: (kb) => kb.screeningAnswers.noticePeriod || kb.profile.availability },
  { match: /visa|sponsor|work permit|right to work|arbetstillstånd|authori[sz]ation/i, resolve: (kb) => (kb.screeningAnswers.visaSponsorshipNeeded ? "Yes — sponsorship required." : `No — ${kb.profile.workAuthorization}.`) },
  { match: /relocat|flytt|willing to move/i, resolve: (kb) => kb.screeningAnswers.relocation },
  { match: /remote|on-?site|distans|hybrid|work from/i, resolve: (kb) => `${kb.profile.workModePreference}. ${kb.screeningAnswers.remoteSetup}` },
  { match: /why (do you|are you)|varför|motivation|interested in (this|the) (role|position)/i, resolve: (kb) => kb.screeningAnswers.whyNow },
  { match: /about yourself|presentera dig|tell us about|introduce yourself/i, resolve: (kb) => kb.screeningAnswers.tellMeAboutYourself },
  { match: /linkedin/i, resolve: (kb) => kb.profile.linkedinUrl },
  { match: /github|portfolio/i, resolve: (kb) => kb.profile.githubUrl },
];

const SLOT_RE = /<<[^>]*>>/;

/** Map the posting's screening questions to KB answers; flag what the KB can't fill. */
export function buildScreeningAnswers(facts: RoleFacts, kb: KnowledgeBase): ScreeningResult {
  const answers: Array<{ q: string; a: string }> = [];
  const missing: string[] = [];

  const questions = facts.screeningQuestions.length
    ? facts.screeningQuestions
    : ["Salary expectations?", "Notice period?", "Work authorization?", "Remote/relocation?"];

  for (const q of questions) {
    const resolver = RESOLVERS.find((r) => r.match.test(q));
    if (!resolver) {
      missing.push(`Unmapped screening question: "${q}"`);
      continue;
    }
    const a = resolver.resolve(kb).trim();
    if (!a || SLOT_RE.test(a)) {
      missing.push(`KB lacks an answer for: "${q}" (fill the slot in the KB)`);
      continue;
    }
    answers.push({ q, a });
  }
  return { answers, missing };
}

// ── LLM-assisted draft (truth-guarded, falls back to deterministic) ───────────

export interface CoverLetterResult {
  text: string;
  source: "deterministic" | "llm";
  /** Numbers the LLM cited that the KB doesn't back (empty ⇒ clean). */
  unbacked: string[];
  neverClaim: string[];
}

/**
 * Draft a cover letter. With a live LLM we ask for a tailored draft, then validate
 * it against the KB; if it fabricates a metric or asserts a never-claim, we DROP
 * it and ship the deterministic template. Truth beats polish, always.
 */
export async function draftCoverLetter(
  facts: RoleFacts,
  kb: KnowledgeBase,
  opts: { llm?: LlmClient; systemPrompt?: string } = {},
): Promise<CoverLetterResult> {
  const deterministic = deterministicCoverLetter(facts, kb);

  if (!opts.llm) {
    return { text: deterministic, source: "deterministic", unbacked: [], neverClaim: [] };
  }

  const user =
    `Write a cover letter for Svee applying to "${facts.role}" at ${facts.company}. ` +
    `Follow the COVER LETTER / OUTREACH RULES: max ~180 words, no "Dear Hiring Manager" opener, ` +
    `name the actual company/role, cite exactly one proof with a number FROM THE ACHIEVEMENT BANK. ` +
    `Use ONLY facts from the KNOWLEDGE BASE. Posting summary: ${facts.descriptionText.slice(0, 1200)}`;

  let llmText = "";
  try {
    llmText = (await opts.llm.complete({ system: opts.systemPrompt ?? "", user })).trim();
  } catch {
    return { text: deterministic, source: "deterministic", unbacked: [], neverClaim: [] };
  }

  if (!llmText) {
    return { text: deterministic, source: "deterministic", unbacked: [], neverClaim: [] };
  }

  const unbacked = unbackedMetrics(llmText, kb);
  const nc = neverClaimViolations(llmText, kb);
  if (unbacked.length || nc.length) {
    // Truth-first: refuse the LLM draft, keep the provably-KB-bound one.
    return { text: deterministic, source: "deterministic", unbacked, neverClaim: nc };
  }
  return { text: llmText, source: "llm", unbacked: [], neverClaim: [] };
}
