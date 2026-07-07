/**
 * Historical backfill. Walks a date range in windows (oldest→newest), pulling
 * actions + clicks per window and upserting. Idempotent, so it is safe to
 * re-run or overlap with the incremental sync. Purge is skipped during backfill.
 */
import type { ImpactClient } from "../client/impact-client.js";
import type { Database } from "./db.js";
import { applySchema } from "./db.js";
import { upsertActions, upsertClicks } from "./upserts.js";
import { collect } from "../client/pagination.js";
import { daysAgo } from "../util/date.js";

export interface BackfillOptions {
  from: Date;
  to?: Date;
  /** Window size in days per pull. Default 7. */
  windowDays?: number;
  batchSize?: number;
}

export interface BackfillSummary {
  windows: number;
  actions: number;
  clicks: number;
  from: string;
  to: string;
}

export async function runBackfill(
  client: ImpactClient,
  db: Database,
  options: BackfillOptions,
): Promise<BackfillSummary> {
  await applySchema(db);
  const windowDays = options.windowDays ?? 7;
  const to = options.to ?? new Date();
  const summary: BackfillSummary = {
    windows: 0,
    actions: 0,
    clicks: 0,
    from: options.from.toISOString(),
    to: to.toISOString(),
  };

  let cursor = new Date(options.from.getTime());
  while (cursor < to) {
    const windowEnd = new Date(Math.min(cursor.getTime() + windowDays * 86_400_000, to.getTime()));
    summary.windows++;
    client.logger.info("backfill window", { start: cursor.toISOString(), end: windowEnd.toISOString() });

    const actions = await collect(client.actions.iterate({ startDate: cursor, endDate: windowEnd }));
    summary.actions += await upsertActions(db, actions);

    const clicks = await collect(client.clicks.iterate({ startDate: cursor, endDate: windowEnd }));
    summary.clicks += await upsertClicks(db, clicks);

    cursor = windowEnd;
  }
  return summary;
}

/** Convenience: backfill the last N days. */
export function backfillLastNDays(client: ImpactClient, db: Database, days: number, opts?: Partial<BackfillOptions>) {
  return runBackfill(client, db, { from: daysAgo(days), ...opts });
}
