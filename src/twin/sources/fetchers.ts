/**
 * Live board fetchers for WATCHED company ATS boards. Greenhouse and Lever both
 * expose PUBLIC job JSON (no login, no scraping — fully within ToS), which is the
 * spec's preferred intake channel ("Company career pages you're watching (ATS)").
 *
 * These are the seam `boardSource` accepts. Kept resilient (timeout + one retry)
 * and dependency-free (native fetch). Unit-tested with a stubbed fetch so no
 * network is touched in CI — matching the impact.com layer's mocked-HTTP posture.
 */
import type { Source } from "../kb.schema.js";
import type { BoardFetcher } from "./adapters.js";
import type { RawListing } from "./types.js";

/** Minimal HTML → text: strip tags, decode the common entities. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** The board slug from a source: url path, or a `greenhouse:<token>` query. */
export function greenhouseToken(source: Source): string | null {
  const m = /boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/|embed\/job_board\?for=|)([a-z0-9_-]+)/i.exec(
    source.url,
  );
  if (m?.[1]) return m[1];
  const q = /greenhouse:([a-z0-9_-]+)/i.exec(source.query);
  return q?.[1] ?? null;
}

export function leverCompany(source: Source): string | null {
  const m = /(?:jobs|api)\.lever\.co\/(?:v0\/postings\/)?([a-z0-9_-]+)/i.exec(source.url);
  if (m?.[1]) return m[1];
  const q = /lever:([a-z0-9_-]+)/i.exec(source.query);
  return q?.[1] ?? null;
}

function label(source: Source, fallback: string): string {
  return source.name?.trim() || fallback;
}

interface GreenhouseJob {
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string;
}

export async function greenhouseFetcher(source: Source): Promise<RawListing[]> {
  const token = greenhouseToken(source);
  if (!token) return [];
  const data = (await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`)) as {
    jobs?: GreenhouseJob[];
  };
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs
    .filter((j) => j.title && j.absolute_url)
    .map((j) => ({
      company: label(source, token),
      role: j.title!,
      url: j.absolute_url!,
      text: stripHtml(j.content ?? ""),
      source: source.name,
      facts: {
        location: j.location?.name ?? null,
        atsVendor: "greenhouse" as const,
        applyMethod: "ats" as const,
      },
    }));
}

interface LeverPosting {
  text?: string;
  hostedUrl?: string;
  categories?: { location?: string; team?: string };
  descriptionPlain?: string;
  description?: string;
}

export async function leverFetcher(source: Source): Promise<RawListing[]> {
  const company = leverCompany(source);
  if (!company) return [];
  const data = (await fetchJson(`https://api.lever.co/v0/postings/${company}?mode=json`)) as LeverPosting[];
  const posts = Array.isArray(data) ? data : [];
  return posts
    .filter((p) => p.text && p.hostedUrl)
    .map((p) => ({
      company: label(source, company),
      role: p.text!,
      url: p.hostedUrl!,
      text: p.descriptionPlain ?? stripHtml(p.description ?? ""),
      source: source.name,
      facts: {
        location: p.categories?.location ?? null,
        atsVendor: "lever" as const,
        applyMethod: "ats" as const,
      },
    }));
}

/** Pick a fetcher for a source by its URL/query. Undefined ⇒ no live fetch. */
export function buildFetcher(source: Source): BoardFetcher | undefined {
  const hay = `${source.url} ${source.query}`.toLowerCase();
  if (hay.includes("greenhouse")) return greenhouseFetcher;
  if (hay.includes("lever")) return leverFetcher;
  return undefined;
}
