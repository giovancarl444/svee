/**
 * Transparent pagination over impact.com's paging scheme.
 *
 * impact.com wraps list responses in an envelope of string-valued meta fields
 * plus one array property named after the resource, e.g.:
 *
 *   {
 *     "@page": "1", "@numpages": "5", "@pagesize": "100", "@total": "437",
 *     "@nextpageuri": "/Advertisers/{SID}/Actions?Page=2",
 *     "Actions": [ {...}, {...} ]
 *   }
 *
 * We follow `@nextpageuri` until it is absent/empty. Callers get a flat async
 * iterator of items and never think about pages.
 *
 * VERIFY (docs egress blocked in this build): confirm the envelope field names
 * (`@nextpageuri`, `@page`, `@total`) on .../readme/pagination.md. They are
 * centralised in ENVELOPE below so a correction is one edit.
 */
import type { HttpClient, QueryParams } from "./http.js";

export const ENVELOPE = {
  nextPageUri: "@nextpageuri",
  page: "@page",
  numPages: "@numpages",
  pageSize: "@pagesize",
  total: "@total",
} as const;

export interface PaginateOptions {
  query?: QueryParams;
  /** The envelope property holding the array. If omitted, the first array field is used. */
  dataKey?: string;
  /** Page size hint (impact.com uses `PageSize`). */
  pageSize?: number;
  /** Hard safety cap on pages fetched; guards against runaway loops. */
  maxPages?: number;
}

interface Envelope {
  [key: string]: unknown;
}

function extractItems<T>(payload: Envelope, dataKey?: string): T[] {
  if (dataKey) {
    const v = payload[dataKey];
    return Array.isArray(v) ? (v as T[]) : [];
  }
  for (const [key, value] of Object.entries(payload)) {
    if (key.startsWith("@")) continue;
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

function nextUri(payload: Envelope): string | undefined {
  const raw = payload[ENVELOPE.nextPageUri];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : undefined;
}

/**
 * Yield every item across all pages of a paged endpoint. Follows the server's
 * own `@nextpageuri`, so page-size/cursor semantics stay server-authoritative.
 */
export async function* paginate<T>(
  http: HttpClient,
  path: string,
  options: PaginateOptions = {},
): AsyncGenerator<T, void, void> {
  const maxPages = options.maxPages ?? 10_000;
  const firstQuery: QueryParams = { ...options.query };
  if (options.pageSize) firstQuery.PageSize = options.pageSize;

  let pagePath: string | undefined = path;
  let query: QueryParams | undefined = firstQuery;
  let pages = 0;

  while (pagePath) {
    if (pages >= maxPages) throw new Error(`paginate: exceeded maxPages=${maxPages} for ${path}`);
    pages++;
    const res = await http.get<Envelope>(pagePath, query ? { query } : {});
    const items = extractItems<T>(res.data, options.dataKey);
    for (const item of items) yield item;

    // Subsequent pages: the server-provided URI already carries the cursor,
    // so we must NOT re-append the original query.
    pagePath = nextUri(res.data);
    query = undefined;
  }
}

/** Drain a paginator into an array. Optional `limit` short-circuits early. */
export async function collect<T>(iter: AsyncIterable<T>, limit = Infinity): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) {
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Fetch just the first page and return its total-count meta, cheaply. */
export async function pageMeta(
  http: HttpClient,
  path: string,
  query?: QueryParams,
): Promise<{ total?: number; numPages?: number; pageSize?: number }> {
  const res = await http.get<Envelope>(path, query ? { query } : {});
  const num = (k: string) => {
    const v = res.data[k];
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  return { total: num(ENVELOPE.total), numPages: num(ENVELOPE.numPages), pageSize: num(ENVELOPE.pageSize) };
}
