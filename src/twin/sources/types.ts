/**
 * Source adapter contract. A source turns some external surface (a pasted link,
 * a board search, an ATS page) into `RawListing`s, which `parseListing` then
 * normalizes to `RoleFacts`. Mirrors the impact.com layer's pluggable-adapter
 * shape so new sources are a one-file drop-in.
 */
import type { RoleFacts } from "../facts.js";

export interface RawListing {
  company?: string;
  role?: string;
  url?: string;
  source?: string;
  /** Raw posting text for heuristic parsing (optional if `facts` is complete). */
  text?: string;
  applyEmail?: string;
  /** Structured overrides — anything provided here wins over heuristics. */
  facts?: Partial<RoleFacts>;
}

export interface SourceAdapter {
  name: string;
  fetch(): Promise<RawListing[]>;
}
