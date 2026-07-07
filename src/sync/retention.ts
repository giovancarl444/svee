/**
 * GDPR data retention (§3.8). Purge PII-adjacent rows (clicks, actions) older
 * than the configured TTL, keyed on event_date. Aggregated daily_performance
 * carries no row-level PII and is retained for long-term trend.
 */
import type { Database } from "./db.js";
import { daysAgo } from "../util/date.js";

async function deleteOlderThan(db: Database, table: string, cutoffIso: string): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `WITH d AS (DELETE FROM ${table} WHERE event_date < $1 RETURNING 1) SELECT count(*)::int AS n FROM d`,
    [cutoffIso],
  );
  return rows[0]?.n ?? 0;
}

export async function purgeExpired(
  db: Database,
  retentionDays: number,
): Promise<{ cutoff: string; clicks: number; actions: number }> {
  const cutoff = daysAgo(retentionDays).toISOString();
  const clicks = await deleteOlderThan(db, "clicks", cutoff);
  const actions = await deleteOlderThan(db, "actions", cutoff);
  return { cutoff, clicks, actions };
}
