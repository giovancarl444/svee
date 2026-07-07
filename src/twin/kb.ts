/**
 * KB loader. Validates a Knowledge Base against the schema and — critically —
 * reports every leaf that is still an unfilled `<<slot>>`. The spec is explicit:
 * "Do not ship this with empty slots ... Anything left as `<<...>>` will be
 * treated as missing and flagged." A missing slot never gets invented; it flows
 * into the digest's `needs_decision` so a human fills it.
 */
import { readFileSync } from "node:fs";
import { KnowledgeBaseSchema, type KnowledgeBase } from "./kb.schema.js";
import { SVEE_KB } from "./kb.data.js";

/** A leaf is "missing" if it's an empty string or still carries `<<...>>`. */
const SLOT_RE = /<<[^>]*>>/;

export interface LoadedKb {
  kb: KnowledgeBase;
  /** Dotted paths of unfilled/placeholder leaves (e.g. "profile.phone"). */
  missing: string[];
}

/** Recursively collect dotted paths of empty / `<<slot>>` string leaves. */
export function collectMissingSlots(value: unknown, path = ""): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "" || SLOT_RE.test(trimmed)) return [path];
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => collectMissingSlots(v, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      collectMissingSlots(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

/**
 * Fields that are ALLOWED to be blank without being flagged (optional by design:
 * pronouns, a source that has only a query and no URL, etc.). Array indices are
 * stripped for matching, so `sources[2].url` matches `sources.url`.
 */
const OPTIONAL_BLANK_PREFIXES = [
  "profile.pronouns",
  "preferences.hoursConstraints",
  "profile.militaryNote",
  "profile.githubUrl", // optional for a non-engineering profile
  "profile.personalSite",
  "sources.url",
  "sources.query",
];

function isOptionalBlank(path: string): boolean {
  const norm = path.replace(/\[\d+\]/g, "");
  return OPTIONAL_BLANK_PREFIXES.some((p) => norm === p || norm.startsWith(`${p}.`));
}

export function evaluateKb(kb: KnowledgeBase): LoadedKb {
  const missing = collectMissingSlots(kb).filter((p) => !isOptionalBlank(p));
  return { kb, missing };
}

/**
 * Load the KB. With a path, read + parse JSON from disk (so updates propagate
 * without editing code, per the architecture notes). Without one, use the
 * bundled Svee KB. Either way the result is schema-validated and slot-checked.
 */
export function loadKb(path?: string): LoadedKb {
  const raw = path ? (JSON.parse(readFileSync(path, "utf8")) as unknown) : SVEE_KB;
  const kb = KnowledgeBaseSchema.parse(raw);
  return evaluateKb(kb);
}
