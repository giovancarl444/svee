/**
 * Date helpers. impact.com report/action date filters commonly use the format
 * `YYYY-MM-DDTHH:mm:ss` interpreted in the ACCOUNT timezone (no milliseconds,
 * no trailing Z). VERIFY the exact expected format per endpoint against docs.
 */

/** `YYYY-MM-DDTHH:mm:ss` (UTC clock, no ms/Z). VERIFY per-endpoint expectations. */
export function toImpactDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "");
}

/** `YYYY-MM-DD`. */
export function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n: number, from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function startOfDay(d: Date): Date {
  const c = new Date(d.getTime());
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export function lastNDays(n: number, now: Date = new Date()): DateRange {
  return { start: startOfDay(daysAgo(n, now)), end: now };
}
