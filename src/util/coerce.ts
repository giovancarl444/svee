/**
 * Wire→typed coercion helpers. impact.com returns numbers and dates as strings;
 * the sync layer coerces them into DB-friendly values. All helpers are total:
 * they return null on anything unparseable rather than throwing, so one bad
 * field never aborts a whole sync batch.
 */

export function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function toDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const s = String(value);
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export function toDateOnly(value: unknown): string | null {
  const d = toDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

export function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

/** Return the first present, non-empty value among candidate keys. */
export function firstOf(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(obj[k]);
    if (v != null) return v;
  }
  return null;
}
