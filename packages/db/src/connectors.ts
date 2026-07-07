import type { Checkpoint, CheckpointStore, SourceName } from '@cortex/core';
import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { connectors } from './schema';

/** DB-backed CheckpointStore over the `connectors` table (injected into adapters). */
export const dbCheckpointStore: CheckpointStore = {
  async get(source: SourceName): Promise<Checkpoint> {
    const [row] = await getDb()
      .select({ cp: connectors.checkpoint })
      .from(connectors)
      .where(eq(connectors.source, source))
      .limit(1);
    return (row?.cp ?? {}) as Checkpoint;
  },
  async set(source: SourceName, checkpoint: Checkpoint): Promise<void> {
    await getDb()
      .insert(connectors)
      .values({ source, checkpoint })
      .onConflictDoUpdate({
        target: connectors.source,
        set: { checkpoint, updatedAt: new Date() },
      });
  },
};

/** Record a sync outcome (health) for the Connectors view. */
export async function recordConnectorSync(
  source: SourceName,
  patch: { lastSyncAt?: Date; lastError?: string | null; status?: unknown; enabled?: boolean },
): Promise<void> {
  await getDb()
    .insert(connectors)
    .values({ source, ...patch })
    .onConflictDoUpdate({
      target: connectors.source,
      set: { ...patch, updatedAt: new Date() },
    });
}

export async function setConnectorEnabled(source: SourceName, enabled: boolean): Promise<void> {
  await getDb()
    .insert(connectors)
    .values({ source, enabled })
    .onConflictDoUpdate({ target: connectors.source, set: { enabled, updatedAt: new Date() } });
}
