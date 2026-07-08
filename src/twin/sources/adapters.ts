/**
 * Concrete source adapters. `staticSource` / `pastedSource` wrap listings Svee
 * dropped in or the CLI collected. `boardSource` is the pluggable seam for live
 * board/ATS fetching — without an injected fetcher it returns nothing (dry-run
 * first, no network in tests), mirroring the impact.com layer's "wired but not
 * yet run" posture.
 */
import type { Source } from "../kb.schema.js";
import type { RawListing, SourceAdapter } from "./types.js";

/** A source backed by a fixed set of listings. */
export function staticSource(name: string, listings: RawListing[]): SourceAdapter {
  return {
    name,
    async fetch() {
      return listings;
    },
  };
}

/** Listings Svee pasted (highest priority intake). Stamps source='pasted'. */
export function pastedSource(listings: RawListing[]): SourceAdapter {
  return staticSource("pasted", listings.map((l) => ({ ...l, source: l.source ?? "pasted" })));
}

export type BoardFetcher = (source: Source) => Promise<RawListing[]>;

/**
 * A configured board/ATS source. Live fetching is injected (kept out of the
 * library so tests never hit the network). No fetcher ⇒ empty, so the loop still
 * runs deterministically.
 */
export function boardSource(source: Source, fetcher?: BoardFetcher): SourceAdapter {
  return {
    name: source.name,
    async fetch() {
      if (!fetcher) return [];
      const listings = await fetcher(source);
      return listings.map((l) => ({ ...l, source: l.source ?? source.name }));
    },
  };
}

/** Run every adapter and flatten. Adapter failures are isolated (never fatal). */
export async function collectListings(adapters: SourceAdapter[]): Promise<RawListing[]> {
  const out: RawListing[] = [];
  for (const a of adapters) {
    try {
      out.push(...(await a.fetch()));
    } catch {
      // A dead source must not sink the run.
    }
  }
  return out;
}
