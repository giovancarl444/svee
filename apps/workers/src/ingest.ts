import {
  classifyBulkHeuristic,
  classifySchedulingHeuristic,
  recordConnectorSync,
  upsertItem,
} from '@cortex/db';
import { wireAdapters } from './adapters';
import { log } from './logger';
import { adapters } from './registry';

export interface IngestSummary {
  ingested: number;
  bulk: number;
  duplicates: number;
}

/**
 * The ingestion loop (spec §5), per registered adapter, isolated so one failure
 * never breaks the others:
 *   getCheckpoint → fetchSince → normalize → upsert (dedupe) → advance checkpoint.
 * Bulk/automated mail gets a cheap heuristic classification here, before any
 * model call (spec §6); everything else is left for the triage pass.
 */
export async function runIngest(): Promise<IngestSummary> {
  wireAdapters();
  const summary: IngestSummary = { ingested: 0, bulk: 0, duplicates: 0 };

  for (const [source, adapter] of adapters) {
    try {
      const checkpoint = await adapter.getCheckpoint();
      const raw = await adapter.fetchSince(checkpoint);

      for (const r of raw) {
        const normalized = adapter.normalize(r);
        const { itemId, isNew } = await upsertItem(normalized);
        if (!isNew || !itemId) {
          summary.duplicates++;
          continue;
        }
        summary.ingested++;
        if (normalized.bulk) {
          await classifyBulkHeuristic(itemId);
          summary.bulk++;
        } else if (normalized.source === 'calendar') {
          // Calendar events don't need Haiku — classify as scheduling directly.
          await classifySchedulingHeuristic(itemId);
        }
      }

      // Advance the checkpoint only now that items are persisted (getCheckpoint
      // returns the pending cursor computed during fetchSince).
      await adapter.setCheckpoint(await adapter.getCheckpoint());
      await recordConnectorSync(source, { lastSyncAt: new Date(), lastError: null, enabled: true });
      log.info({ source, fetched: raw.length, ...summary }, 'ingest: connector done');
    } catch (err) {
      await recordConnectorSync(source, { lastError: (err as Error).message }).catch(() => {});
      log.error({ source, err }, 'ingest: connector failed — isolated, others continue');
    }
  }

  return summary;
}
