/**
 * FIT SCORING (spec §"FIT SCORING RUBRIC"). Deterministic, pure, and unit-tested
 * — this is the gate that runs BEFORE any tailoring effort, so low-fit roles are
 * discarded cheaply instead of spray-and-prayed.
 *
 *   Skills match ........ 30   Company signal ...... 10
 *   Role-family fit ..... 20   Effort-to-reward .... 5
 *   Seniority realism ... 15   ------------------------
 *   Comp vs floor ....... 10   THRESHOLD default 68
 *   Work mode fit ....... 10
 *
 * Plus HARD FILTERS that auto-reject regardless of score (missing mandatory
 * credential, un-relocatable on-site, dealbreaker, unpaid/scam, comp below floor).
 */
import type { KnowledgeBase } from "./kb.schema.js";
import type { RoleFacts, Seniority } from "./facts.js";

export interface ScoringWeights {
  skills: number;
  roleFamily: number;
  seniority: number;
  comp: number;
  workMode: number;
  company: number;
  effort: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  skills: 30,
  roleFamily: 20,
  seniority: 15,
  comp: 10,
  workMode: 10,
  company: 10,
  effort: 5,
};

export interface ScoreBreakdown {
  skills: number;
  roleFamily: number;
  seniority: number;
  comp: number;
  workMode: number;
  company: number;
  effort: number;
}

export type Tier = "discard" | "stretch" | "prioritize";

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
  /** Non-null → auto-rejected regardless of score; the reason. */
  hardFilter: string | null;
  tier: Tier;
  pass: boolean;
  /** Skills from the posting that matched a real KB skill. */
  matchedSkills: string[];
  /** Human-readable "why" for the digest. */
  reasons: string[];
}

export interface ScoreOptions {
  threshold: number;
  weights?: ScoringWeights;
  /** Hard salary floor in the same unit as facts.compMin. null = unknown. */
  salaryFloor?: number | null;
}

// ── Skill matching ──────────────────────────────────────────────────────────

const SKILL_SYNONYMS: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  nextjs: "next",
  reactjs: "react",
  nodejs: "node",
  postgresql: "postgres",
  psql: "postgres",
  golang: "go",
  "c#": "csharp",
  gpt: "llm",
  "openai": "llm",
  anthropic: "claude",
  gha: "githubactions",
};

/** Normalize a skill token: lowercase, strip separators, apply synonyms. */
export function normalizeSkill(s: string): string {
  const base = s.toLowerCase().replace(/[\s._/-]+/g, "");
  return SKILL_SYNONYMS[base] ?? base;
}

/** All skill tokens the KB can legitimately claim, normalized. */
export function kbSkillTokens(kb: KnowledgeBase): Set<string> {
  const all = [
    ...kb.skills.expert,
    ...kb.skills.strong,
    ...kb.skills.working,
    ...kb.skills.domains,
    ...kb.targetRoles.keywords,
  ];
  return new Set(all.map(normalizeSkill).filter(Boolean));
}

/** Does a required skill map to any KB skill? Substring both directions (≥3 chars). */
function skillMatches(required: string, kbTokens: Set<string>): boolean {
  const req = normalizeSkill(required);
  if (!req) return false;
  if (kbTokens.has(req)) return true;
  for (const tok of kbTokens) {
    if (req.length >= 3 && tok.length >= 3 && (tok.includes(req) || req.includes(tok))) return true;
  }
  return false;
}

// ── Role-family classification ──────────────────────────────────────────────

/** Words too generic to distinguish a role family. */
const COMMON_ROLE_WORDS = new Set([
  "engineer", "developer", "dev", "software", "senior", "junior", "staff",
  "lead", "principal", "the", "of", "and", "a", "an", "i", "ii", "iii",
]);

function distinctiveTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter((t) => t.length >= 2 && !COMMON_ROLE_WORDS.has(t)),
  );
}

export type FamilyBucket = "primary" | "also" | "not" | "unknown";

/** Classify a posting's family against TARGET_ROLES by distinctive-token overlap. */
export function classifyFamily(facts: RoleFacts, kb: KnowledgeBase): FamilyBucket {
  const roleText = `${facts.role} ${facts.roleFamily ?? ""}`;
  const roleTokens = distinctiveTokens(roleText);
  const overlaps = (names: string[]): boolean =>
    names.some((name) => {
      const nameTokens = distinctiveTokens(name);
      for (const t of nameTokens) if (roleTokens.has(t)) return true;
      return false;
    });

  // Explicit exclusions win.
  if (overlaps(kb.targetRoles.notRoles)) return "not";
  if (overlaps(kb.targetRoles.primary)) return "primary";
  if (overlaps(kb.targetRoles.alsoAcceptable)) return "also";
  return "unknown";
}

// ── Seniority ───────────────────────────────────────────────────────────────

const LEVEL: Record<Exclude<Seniority, "unknown">, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
};

function maxBandLevel(kb: KnowledgeBase): number {
  const bandLevels = kb.targetRoles.seniorityBand.map((b) => {
    if (b === "founding") return LEVEL.mid; // founding ≈ mid-scope generalist
    return LEVEL[b] ?? LEVEL.mid;
  });
  return bandLevels.length ? Math.max(...bandLevels) : LEVEL.mid;
}

// ── Hard filters ──────────────────────────────────────────────────────────────

const SCAM_PATTERNS = [
  "registration fee",
  "pay to apply",
  "application fee",
  "wire transfer",
  "processing fee",
  "send money",
  "crypto investment opportunity",
  "guaranteed income",
];

function creditsHeld(kb: KnowledgeBase): string[] {
  return kb.profile.credentials.map((c) => c.toLowerCase());
}

/** First matching hard-filter reason, or null. */
export function hardFilter(
  facts: RoleFacts,
  kb: KnowledgeBase,
  salaryFloor: number | null,
): string | null {
  const text = facts.descriptionText.toLowerCase();

  // Missing mandatory credential Svee doesn't hold.
  if (facts.mandatoryCredential) {
    const held = creditsHeld(kb);
    const cred = facts.mandatoryCredential.toLowerCase();
    const has = held.some((h) => h.includes(cred) || cred.includes(h));
    if (!has) return `requires mandatory credential Svee lacks: ${facts.mandatoryCredential}`;
  }

  // Unpaid / commission-only.
  if (facts.compType === "unpaid") return "unpaid role";
  if (facts.compType === "commission_only") return "commission-only";

  // Dealbreaker industries/companies/terms. Normalize separators both sides so
  // "data-broker" matches the "data broker" token.
  const norm = (s: string) => s.toLowerCase().replace(/[\s/_-]+/g, " ").trim();
  const haystack = norm(`${facts.company} ${facts.industry ?? ""} ${text}`);
  for (const db of kb.preferences.dealbreakers) {
    const term = norm(db);
    if (term && haystack.includes(term)) return `dealbreaker: ${db}`;
  }

  // On-site in a location Svee won't relocate to.
  if (facts.onsite) {
    const loc = (facts.location ?? "").toLowerCase();
    const ok = kb.profile.relocateTo.some((r) => loc.includes(r.toLowerCase()));
    if (!ok) return `on-site in ${facts.location ?? "an un-relocatable location"}`;
  }

  // Scam patterns.
  for (const p of SCAM_PATTERNS) if (text.includes(p)) return `scam pattern: "${p}"`;

  // Comp visibly below floor.
  if (salaryFloor != null && facts.compMin != null && facts.compMin < salaryFloor) {
    return `comp below floor (${facts.compMin} < ${salaryFloor})`;
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function scoreRole(facts: RoleFacts, kb: KnowledgeBase, opts: ScoreOptions): ScoreResult {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const salaryFloor = opts.salaryFloor ?? null;
  const reasons: string[] = [];

  const filter = hardFilter(facts, kb, salaryFloor);

  // Skills (30).
  const kbTokens = kbSkillTokens(kb);
  const matchedSkills = facts.requiredSkills.filter((s) => skillMatches(s, kbTokens));
  const skillFrac = facts.requiredSkills.length ? matchedSkills.length / facts.requiredSkills.length : 0.5;
  const skills = skillFrac * weights.skills;
  if (facts.requiredSkills.length) {
    reasons.push(`${matchedSkills.length}/${facts.requiredSkills.length} required skills matched`);
  }

  // Role-family (20).
  const bucket = classifyFamily(facts, kb);
  const familyFrac = bucket === "primary" ? 1 : bucket === "also" ? 0.6 : bucket === "not" ? 0 : 0.4;
  const roleFamily = familyFrac * weights.roleFamily;
  reasons.push(`role-family: ${bucket}`);

  // Seniority realism (15).
  const maxBand = maxBandLevel(kb);
  let senFrac: number;
  if (facts.seniority === "unknown") senFrac = 0.6;
  else {
    const lvl = LEVEL[facts.seniority];
    senFrac = lvl <= maxBand ? 1 : lvl === maxBand + 1 ? 0.4 : 0;
  }
  if (facts.yearsRequired != null) {
    if (facts.yearsRequired >= 5) senFrac = Math.min(senFrac, 0);
    else if (facts.yearsRequired >= 3) senFrac = Math.min(senFrac, 0.4);
  }
  const seniority = clamp01(senFrac) * weights.seniority;

  // Comp vs floor (10). Unknown = neutral (never discard on unknown comp).
  let compFrac: number;
  if (salaryFloor == null || facts.compMin == null) compFrac = 0.6;
  else if (facts.compMin >= salaryFloor) compFrac = 1;
  else if (facts.compMin >= salaryFloor * 0.85) compFrac = 0.4;
  else compFrac = 0;
  const comp = compFrac * weights.comp;

  // Work mode fit (10).
  const modeFrac =
    facts.workMode === "remote"
      ? 1
      : facts.workMode === "hybrid"
        ? 0.7
        : facts.workMode === "onsite"
          ? 0.2
          : 0.6;
  const workMode = modeFrac * weights.workMode;
  reasons.push(`work mode: ${facts.workMode}`);

  // Company signal (10).
  const companyFrac = facts.companySignal === "good" ? 1 : facts.companySignal === "neutral" ? 0.6 : 0;
  const company = companyFrac * weights.company;

  // Effort-to-reward (5).
  const effortFrac = facts.effort === "easy" ? 1 : facts.effort === "normal" ? 0.6 : 0;
  const effort = effortFrac * weights.effort;

  const breakdown: ScoreBreakdown = { skills, roleFamily, seniority, comp, workMode, company, effort };
  const rawScore = filter
    ? 0
    : Math.round(skills + roleFamily + seniority + comp + workMode + company + effort);

  const pass = !filter && rawScore >= opts.threshold;
  let tier: Tier;
  if (filter || rawScore < opts.threshold) tier = "discard";
  else if (rawScore >= 80) tier = "prioritize";
  else tier = "stretch";

  if (filter) reasons.unshift(`HARD FILTER: ${filter}`);

  return {
    score: rawScore,
    breakdown,
    hardFilter: filter,
    tier,
    pass,
    matchedSkills,
    reasons,
  };
}
