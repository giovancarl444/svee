/**
 * `RoleFacts` — the normalized, structured view of a single job posting that the
 * scorer, channel logic, and tailoring all consume. Source adapters turn raw
 * listings (a pasted link, a board row, an ATS page) into this shape; everything
 * downstream is pure and testable because it only ever sees `RoleFacts`.
 */
export type Seniority = "intern" | "junior" | "mid" | "senior" | "lead" | "unknown";
export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";
export type CompanySignal = "good" | "neutral" | "red";
export type Effort = "easy" | "normal" | "heavy";
export type CompType = "salary" | "unpaid" | "commission_only" | "unknown";

export type ApplyMethod =
  | "ats"
  | "email"
  | "linkedin_easy_apply"
  | "linkedin_external"
  | "company_page"
  | "unknown";

export type AtsVendor = "greenhouse" | "lever" | "ashby" | "workday" | "teamtailor" | "other";

export interface RoleFacts {
  company: string;
  role: string;
  url: string;
  /** Which source surfaced it (e.g. "pasted", "linkedin", a board name). */
  source: string;

  /** Skills the posting requires (raw tokens; matched against the KB skills). */
  requiredSkills: string[];
  /** Best-guess role family label (free text; classified against TARGET_ROLES). */
  roleFamily: string | null;
  seniority: Seniority;
  /** Years of experience the posting demands, if stated. */
  yearsRequired: number | null;
  /** A credential the posting marks MANDATORY (degree/clearance/licence), if any. */
  mandatoryCredential: string | null;

  location: string | null;
  workMode: WorkMode;
  /** Strictly on-site with no remote/hybrid option. */
  onsite: boolean;

  /** Minimum comp, normalized to the KB's SALARY_FLOOR unit. */
  compMin: number | null;
  compCurrency?: string;
  compType: CompType;

  companySignal: CompanySignal;
  effort: Effort;
  industry: string | null;

  /** Raw posting text (used for dealbreaker/scam scans and keyword alignment). */
  descriptionText: string;
  /** Free-text screening questions the application form asks. */
  screeningQuestions: string[];

  applyMethod: ApplyMethod;
  applyEmail?: string;
  atsVendor?: AtsVendor;
}

/** Deterministic natural key for a posting (dedupe + jobs PK). */
export function jobKey(facts: Pick<RoleFacts, "company" | "role" | "url">): string {
  const basis = facts.url.trim() || `${facts.company}::${facts.role}`;
  return basis.toLowerCase();
}
