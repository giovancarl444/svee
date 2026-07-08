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
  upsertPrograms,
  upsertMediaProperties,
  upsertDeals,
} from "./upserts.js";
import { rebuildDailyPerformance } from "./daily.js";
import { isImpactError } from "../client/errors.js";
import { getWatermark, advanceWatermark } from "./watermark.js";
import { purgeExpired } from "./retention.js";
import { toDate } from "../util/coerce.js";
import type { Action, Click } from "../types/impact.js";

export interface StageResult {
  stage: string;
  upserted: number;
  ok: boolean;
  /** True when an optional resource was unavailable (403) and skipped, not failed. */
  skipped?: boolean;
  error?: string;
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string;
  stages: StageResult[];
  purged?: { clicks: number; actions: number; webhookEvents: number };
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
  opts: { optional?: boolean } = {},
): Promise<void> {
  try {
    const upserted = await fn();
    summary.stages.push({ stage, upserted, ok: true });
    log(`sync stage ok: ${stage}`, { upserted });
  } catch (err) {
    // An optional resource the account isn't scoped for (403) is skipped, not
    // failed — it must not sink the whole sync (and the cron exit code).
    if (opts.optional && isImpactError(err) && err.kind === "forbidden") {
      summary.stages.push({ stage, upserted: 0, ok: true, skipped: true, error: (err as Error).message });
      log(`sync stage skipped (not available for this account): ${stage}`, {});
      return;
    }
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

  // --- Relationships / inventory (persona-aware) ---------------------------
  const syncCatalogs = async () => {
    const catalogs = await client.catalogs.list();
    let n = 0;
    for (const cat of catalogs) {
      const id = String(cat.Id ?? "");
      if (!id) continue;
      n += await drainInBatches(client.catalogs.items(id), batchSize, (b) => upsertCatalogItems(db, id, b));
    }
    return n;
  };

  const optional = { optional: true };
  if (client.config.persona === "brand") {
    await runStage(summary, "partners", async () => upsertPartners(db, await client.partners.list()), log);
    await runStage(summary, "contracts", async () => upsertContracts(db, await client.partners.listContracts()), log, optional);
    await runStage(summary, "catalogs", syncCatalogs, log, optional);
  } else {
    // Partner persona: programs (advertiser campaigns), contracts, the partner's
    // own media properties, deals, and catalogs of programs they promote.
    // The relationship/inventory extras are optional — a 403 (resource not
    // scoped for this key) skips rather than failing the whole sync.
    await runStage(summary, "programs", async () => upsertPrograms(db, await client.programs.list()), log);
    await runStage(summary, "contracts", async () => upsertContracts(db, await client.partners.listContracts()), log, optional);
    await runStage(summary, "media_properties", async () => upsertMediaProperties(db, await client.mediaProperties.list()), log, optional);
    await runStage(summary, "deals", async () => upsertDeals(db, await client.deals.list()), log, optional);
    await runStage(summary, "catalogs", syncCatalogs, log, optional);
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

  // --- Daily performance (derived from synced actions + clicks) ------------
  // Self-sufficient: avoids impact.com's report-export engine (which 500s on
  // some custom reports). Runs after actions/clicks are in.
  await runStage(summary, "daily_performance", () => rebuildDailyPerformance(db), log);

  // --- Retention purge -----------------------------------------------------
  // Run as a real stage so a purge failure surfaces in summary.stages (which the
  // cron entrypoint turns into a non-zero exit), not just a log line.
  if (!options.skipPurge) {
    await runStage(summary, "purge", async () => {
      const purged = await purgeExpired(db, client.config.db.retentionDays);
      summary.purged = purged;
      return purged.clicks + purged.actions + purged.webhookEvents;
    }, log);
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}
