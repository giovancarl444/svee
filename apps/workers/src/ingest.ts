import { connectors, getDb } from '@cortex/db';
import { eq } from 'drizzle-orm';
import { log } from './logger';
import { adapters } from './registry';

/**
 * The ingestion loop (spec §5). For each enabled adapter, isolated so one
 * failure never breaks the others:
 *   getCheckpoint → fetchSince → normalize → upsert (dedupe) → advance → enqueue triage.
 * Phase 0: the registry is empty, so this reports and returns. The loop shape is
 * here so Phase 1 only has to register the Gmail adapter.
 */
export async function runIngest(): Promise<void> {
  const db = getDb();
  const enabled = await db.select().from(connectors).where(eq(connectors.enabled, true));
  log.info({ enabledConnectors: enabled.map((c) => c.source) }, 'ingest: starting');

  if (adapters.size === 0) {
    log.info('ingest: no adapters registered yet (Phase 0 skeleton) — nothing to do');
    return;
  }

  for (const [source, adapter] of adapters) {
    try {
      const checkpoint = await adapter.getCheckpoint();
      const raw = await adapter.fetchSince(checkpoint);
      log.info({ source, fetched: raw.length }, 'ingest: fetched (normalize/upsert wired in Phase 1)');
      // Phase 1: normalize → upsert on (source, source_item_id) → advance checkpoint → enqueue triage.
    } catch (err) {
      log.error({ source, err }, 'ingest: adapter failed — isolated, other connectors continue');
    }
  }
}
