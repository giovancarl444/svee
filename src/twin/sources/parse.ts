/**
 * Heuristic parser: RawListing → RoleFacts. Structured `facts` overrides always
 * win over the text heuristics, so a pasted link can supply exact facts while a
 * scraped board row relies on best-effort extraction. Pure and unit-tested.
 */
import type {
  ApplyMethod,
  CompType,
  CompanySignal,
  Effort,
  RoleFacts,
  Seniority,
  WorkMode,
} from "../facts.js";
import { detectAtsVendor } from "../channel.js";
import type { RawListing } from "./types.js";

/** A generic tech vocabulary for skill extraction (matched against the KB later). */
const SKILL_VOCAB = [
  "typescript", "javascript", "react", "next.js", "nextjs", "node", "node.js", "vue", "svelte",
  "python", "go", "golang", "rust", "java", "kotlin", "ruby", "php", "c#", "c++",
  "supabase", "postgres", "postgresql", "mysql", "mongodb", "redis", "prisma", "graphql",
  "vercel", "cloudflare", "aws", "gcp", "azure", "docker", "kubernetes", "terraform",
  "tailwind", "css", "html", "rest", "grpc", "kafka", "rabbitmq",
  "stripe", "crypto", "solana", "ethereum", "web3",
  "ai", "llm", "claude", "openai", "langchain", "rag", "agents", "ml", "pytorch", "tensorflow",
  "github actions", "ci/cd", "playwright", "vitest", "jest", "cypress",
];

function lc(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Boundary-aware matchers so short tokens (ai, go, ml, java, rest) don't match
// inside common words ("available"→ai, "interested"→rest, "javascript"→java).
// Boundaries are non-alphanumeric transitions, which also work for "next.js"/"c#".
const SKILL_MATCHERS = SKILL_VOCAB.map((skill) => ({
  skill,
  re: new RegExp(`(?<![a-z0-9])${escapeRe(skill)}(?![a-z0-9])`, "i"),
}));

export function extractSkills(text: string): string[] {
  return [...new Set(SKILL_MATCHERS.filter((m) => m.re.test(text)).map((m) => m.skill))];
}

function detectSeniority(text: string): Seniority {
  const t = lc(text);
  if (/\bintern(ship)?\b/.test(t)) return "intern";
  if (/\b(lead|principal|staff|head of)\b/.test(t)) return "lead";
  if (/\bsenior\b|\bsr\.?\b/.test(t)) return "senior";
  if (/\bjunior\b|\bjr\.?\b|\bgraduate\b|\bentry[- ]level\b/.test(t)) return "junior";
  if (/\bmid[- ]?level\b|\bmid\b/.test(t)) return "mid";
  return "unknown";
}

function detectYears(text: string): number | null {
  const m = /(\d+)\s*\+?\s*(?:years?|yrs?|års?)/i.exec(text);
  return m ? Number(m[1]) : null;
}

function detectMandatoryCredential(text: string): string | null {
  const t = lc(text);
  // Only flag when clearly MANDATORY.
  if (/(bachelor|master|phd|degree|examen)\b[^.]*\b(required|must have|mandatory|krävs)/.test(t))
    return "university degree";
  if (/(security )?clearance\b[^.]*\b(required|must|mandatory)/.test(t)) return "security clearance";
  if (/(driver'?s licen[cs]e|körkort)\b[^.]*\b(required|must|mandatory|krävs)/.test(t))
    return "driver's licence";
  return null;
}

function detectWorkMode(text: string): { workMode: WorkMode; onsite: boolean } {
  const t = lc(text);
  if (/\bfully remote\b|\b100% remote\b|\bremote[- ]first\b|\bremote\b/.test(t) && !/\bno remote\b|\bon-?site only\b/.test(t))
    return { workMode: "remote", onsite: false };
  if (/\bhybrid\b/.test(t)) return { workMode: "hybrid", onsite: false };
  if (/\bon-?site\b|\bin[- ]office\b|\bon[- ]premise\b|\bon plats\b/.test(t))
    return { workMode: "onsite", onsite: true };
  return { workMode: "unknown", onsite: false };
}

function detectCompType(text: string): CompType {
  const t = lc(text);
  if (/\bunpaid\b|\bno (salary|pay)\b|\bvolunteer\b/.test(t)) return "unpaid";
  if (/\bcommission[- ]only\b|\b100% commission\b/.test(t)) return "commission_only";
  return "salary";
}

function detectComp(text: string): { compMin: number | null; compCurrency?: string } {
  // Requires a currency marker so we don't grab "6+ years". Handles "45000 SEK",
  // "SEK 45,000", "€50k", and ranges "€40-55k" (the trailing k scales the whole
  // range; we take the LOWER bound). "kr"/"SEK" never trigger the k×1000 suffix
  // because `k\b` needs a word boundary after the k (there isn't one in "kr").
  const currency = /€|\bEUR\b/i.test(text)
    ? "EUR"
    : /\$|\bUSD\b/i.test(text)
      ? "USD"
      : /\bSEK\b|\bkr\b/i.test(text)
        ? "SEK"
        : undefined;
  if (!currency) return { compMin: null };

  const re =
    /(?:SEK|kr|EUR|€|\$|USD)\s*(\d[\d.,]*)(?:\s*[-–]\s*\d[\d.,]*)?\s*(k\b)?|(\d[\d.,]*)(?:\s*[-–]\s*\d[\d.,]*)?\s*(k\b)?\s*(?:SEK|kr|EUR|€|USD)/i;
  const m = re.exec(text);
  if (!m) return { compMin: null };
  const lower = m[1] ?? m[3];
  const kFlag = Boolean(m[2] ?? m[4]);
  let n = Number((lower ?? "").replace(/[\s,]/g, ""));
  if (!Number.isFinite(n) || n === 0) return { compMin: null };
  if (kFlag) n *= 1000;
  return { compMin: n, compCurrency: currency };
}

function detectEffort(text: string): Effort {
  const t = lc(text);
  if (/\btake[- ]home\b|\bcoding (challenge|assignment|test)\b|\bhackerrank\b|\bcodility\b/.test(t))
    return "heavy";
  if (/\beasy apply\b|\bquick apply\b|\bone[- ]click\b/.test(t)) return "easy";
  return "normal";
}

function detectApplyMethod(url: string, raw: RawListing): ApplyMethod {
  if (raw.facts?.applyMethod) return raw.facts.applyMethod;
  const u = lc(url);
  // ATS wins over email (spec channel preference: ATS > email > LinkedIn), so a
  // posting carrying both an application email and an ATS/career URL routes to ATS.
  if (detectAtsVendor(url)) return u.includes("linkedin.com") ? "linkedin_external" : "ats";
  if (raw.applyEmail || raw.facts?.applyEmail) return "email";
  if (u.includes("linkedin.com/jobs")) return "linkedin_easy_apply";
  if (u.includes("linkedin.com")) return "linkedin_external";
  if (u.includes("/careers") || u.includes("/jobs")) return "company_page";
  return "unknown";
}

/** Normalize a RawListing into RoleFacts. Structured `facts` overrides win. */
export function parseListing(raw: RawListing): RoleFacts {
  const text = raw.text ?? "";
  const url = raw.url ?? raw.facts?.url ?? "";
  const { workMode, onsite } = detectWorkMode(text);
  const comp = detectComp(text);

  const heuristic: RoleFacts = {
    company: raw.company ?? raw.facts?.company ?? "Unknown company",
    role: raw.role ?? raw.facts?.role ?? "Unknown role",
    url,
    source: raw.source ?? raw.facts?.source ?? "unknown",
    requiredSkills: extractSkills(text),
    roleFamily: null,
    seniority: detectSeniority(`${raw.role ?? ""} ${text}`),
    yearsRequired: detectYears(text),
    mandatoryCredential: detectMandatoryCredential(text),
    location: raw.facts?.location ?? null,
    workMode,
    onsite,
    compMin: comp.compMin,
    ...(comp.compCurrency ? { compCurrency: comp.compCurrency } : {}),
    compType: detectCompType(text),
    companySignal: "neutral" as CompanySignal,
    effort: detectEffort(text),
    industry: raw.facts?.industry ?? null,
    descriptionText: text,
    screeningQuestions: [],
    applyMethod: detectApplyMethod(url, raw),
    ...(raw.applyEmail ? { applyEmail: raw.applyEmail } : {}),
  };

  // Structured overrides always win.
  return { ...heuristic, ...(raw.facts ?? {}) };
}
