/**
 * Sync orchestrator: pull from impact.com → idempotent upsert into the
 * warehouse, incrementally by date watermark. Each stage is isolated so one
 * failing stage doesn't abort the rest; the returned summary reports per-stage
 * counts and errors for logging/alerting.
 */
import type { ImpactClient } from "../client/impact-client.js";
import type { Database } from "./db.js";
import { applySchema } from "./db.js";
import {
  upsertActions,
  upsertClicks,
  upsertPartners,
  upsertContracts,
  upsertCatalogItems,
  upsertDailyPerformance,
} from "./upserts.js";
import { getWatermark, advanceWatermark } from "./watermark.js";
import { purgeExpired } from "./retention.js";
import { toDate } from "../util/coerce.js";
import type { Action, Click } from "../types/impact.js";

export interface StageResult {
  stage: string;
  upserted: number;
  ok: boolean;
  error?: string;
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string;
  stages: StageResult[];
  purged?: { clicks: number; actions: number };
}

export interface SyncOptions {
  /** Ensure schema exists first (idempotent). Default true. */
  migrate?: boolean;
  /** Lookback (days) used on a source's first run. Default 30. */
  firstRunLookbackDays?: number;
  /** Rows buffered before each upsert flush. Default 1000. */
  batchSize?: number;
  /** Skip the retention purge (e.g. during a backfill). Default false. */
  skipPurge?: boolean;
  /** Days of performance report to refresh. Default 30. */
  performanceDays?: number;
}

async function runStage(
  summary: SyncSummary,
  stage: string,
  fn: () => Promise<number>,
  log: (msg: string, f?: Record<string, unknown>) => void,
): Promise<void> {
  try {
    const upserted = await fn();
    summary.stages.push({ stage, upserted, ok: true });
    log(`sync stage ok: ${stage}`, { upserted });
  } catch (err) {
    summary.stages.push({ stage, upserted: 0, ok: false, error: (err as Error).message });
    log(`sync stage FAILED: ${stage}`, { error: (err as Error).message });
  }
}

/** Buffer an async iterable into batches and flush each via `flush`. */
async function drainInBatches<T>(
  iter: AsyncIterable<T>,
  batchSize: number,
  flush: (batch: T[]) => Promise<number>,
  onItem?: (item: T) => void,
): Promise<number> {
  let buffer: T[] = [];
  let total = 0;
  for await (const item of iter) {
    if (onItem) onItem(item);
    buffer.push(item);
    if (buffer.length >= batchSize) {
      total += await flush(buffer);
      buffer = [];
    }
  }
  if (buffer.length) total += await flush(buffer);
  return total;
}

export async function runSync(client: ImpactClient, db: Database, options: SyncOptions = {}): Promise<SyncSummary> {
  const batchSize = options.batchSize ?? 1000;
  const lookback = options.firstRunLookbackDays ?? 30;
  const log = (msg: string, f?: Record<string, unknown>) => client.logger.info(msg, f);
  const summary: SyncSummary = { startedAt: new Date().toISOString(), finishedAt: "", stages: [] };

  if (options.migrate !== false) {
    await runStage(summary, "migrate", async () => {
      await applySchema(db);
      return 0;
    }, log);
  }

  // --- Relationships (brand persona) ---------------------------------------
  if (client.config.persona === "brand") {
    await runStage(summary, "partners", async () => upsertPartners(db, await client.partners.list()), log);
    await runStage(summary, "contracts", async () => upsertContracts(db, await client.partners.listContracts()), log);
    await runStage(summary, "catalogs", async () => {
      const catalogs = await client.catalogs.list();
      let n = 0;
      for (const cat of catalogs) {
        const id = String(cat.Id ?? "");
        if (!id) continue;
        n += await drainInBatches(client.catalogs.items(id), batchSize, (b) => upsertCatalogItems(db, id, b));
      }
      return n;
    }, log);
  } else {
    log("sync: partner persona — skipping brand-only partner/contract/catalog stages", {});
  }

  // --- Actions (incremental) -----------------------------------------------
  await runStage(summary, "actions", async () => {
    const since = await getWatermark(db, "actions", lookback);
    let maxDate = since;
    const n = await drainInBatches<Action>(
      client.actions.iterateSince(since),
      batchSize,
      (b) => upsertActions(db, b),
      (a) => {
        const d = toDate(a.EventDate);
        if (d && d > maxDate) maxDate = d;
      },
    );
    await advanceWatermark(db, "actions", maxDate);
    return n;
  }, log);

  // --- Clicks (incremental) ------------------------------------------------
  await runStage(summary, "clicks", async () => {
    const since = await getWatermark(db, "clicks", lookback);
    let maxDate = since;
    const n = await drainInBatches<Click>(
      client.clicks.iterateSince(since),
      batchSize,
      (b) => upsertClicks(db, b),
      (c) => {
        const d = toDate(c.EventDate ?? c.DateTime);
        if (d && d > maxDate) maxDate = d;
      },
    );
    await advanceWatermark(db, "clicks", maxDate);
    return n;
  }, log);

  // --- Daily performance (report) ------------------------------------------
  await runStage(summary, "daily_performance", async () => {
    const rows = await client.reports.performance({ days: options.performanceDays ?? 30 });
    return upsertDailyPerformance(db, rows);
  }, log);

  // --- Retention purge -----------------------------------------------------
  if (!options.skipPurge) {
    try {
      summary.purged = await purgeExpired(db, client.config.db.retentionDays);
      log("sync: purged expired rows", summary.purged);
    } catch (err) {
      log("sync: purge FAILED", { error: (err as Error).message });
    }
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}
