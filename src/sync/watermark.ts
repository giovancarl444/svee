/**
 * Incremental sync watermarks. Each logical source (actions, clicks, …) keeps a
 * high-water timestamp in `sync_state`. Reads default to a lookback window on
 * first run so a fresh DB backfills a sensible slice instead of everything.
 */
import type { Database } from "./db.js";
import { daysAgo } from "../util/date.js";

export async function getWatermark(db: Database, source: string, defaultLookbackDays = 30): Promise<Date> {
  const rows = await db.query<{ watermark: string | null }>(
    "SELECT watermark FROM sync_state WHERE source = $1",
    [source],
  );
  const wm = rows[0]?.watermark;
  return wm ? new Date(wm) : daysAgo(defaultLookbackDays);
}

export async function setWatermark(db: Database, source: string, watermark: Date): Promise<void> {
  await db.query(
    `INSERT INTO sync_state (source, watermark, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (source) DO UPDATE SET watermark = EXCLUDED.watermark, updated_at = now()`,
    [source, watermark.toISOString()],
  );
}

/** Only advance the watermark forward (never regress on a partial pull). */
export async function advanceWatermark(db: Database, source: string, candidate: Date): Promise<void> {
  const current = await getWatermark(db, source, 3650);
  if (candidate > current) await setWatermark(db, source, candidate);
}
