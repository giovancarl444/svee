import type {
  AdapterStatus,
  Checkpoint,
  CheckpointStore,
  NormalizedItem,
  RawItem,
  SourceAdapter,
  SourceName,
} from '@cortex/core';

type DemoCheckpoint = Checkpoint & { seeded?: boolean };

/**
 * A read-only, in-memory {@link SourceAdapter} that emits a fixed set of
 * SYNTHETIC items for ONE source slot (enabled by CORTEX_DEMO=1). It has NO
 * network and NO send path: it hands the pipeline a pre-built list once, then
 * reports "already seeded" so repeated syncs are idempotent (upsert dedupes
 * regardless). This lets the entire ingest → triage → escalate → synthesize
 * pipeline run end-to-end against realistic data with zero real accounts.
 */
export class DemoAdapter implements SourceAdapter {
  readonly source: SourceName;
  readonly #items: NormalizedItem[];
  readonly #store: CheckpointStore;
  #pending: DemoCheckpoint | null = null;

  constructor(deps: { source: SourceName; items: NormalizedItem[]; store: CheckpointStore }) {
    this.source = deps.source;
    this.#items = deps.items;
    this.#store = deps.store;
  }

  async getCheckpoint(): Promise<Checkpoint> {
    if (this.#pending) return this.#pending;
    return this.#store.get(this.source);
  }

  async setCheckpoint(c: Checkpoint): Promise<void> {
    await this.#store.set(this.source, c);
    this.#pending = null;
  }

  /** The seed items already ARE normalized; unwrap the payload. Pure, no I/O. */
  normalize(raw: RawItem): NormalizedItem {
    return raw.payload as NormalizedItem;
  }

  /** Emit the synthetic items once, then nothing (idempotent re-runs). */
  async fetchSince(checkpoint: Checkpoint): Promise<RawItem[]> {
    if ((checkpoint as DemoCheckpoint).seeded) return [];
    this.#pending = { seeded: true };
    return this.#items.map((it) => ({ sourceItemId: it.sourceItemId, payload: it }));
  }

  async status(): Promise<AdapterStatus> {
    return {
      source: this.source,
      connected: true,
      authValid: true,
      detail: `demo (synthetic) — ${this.#items.length} items`,
    };
  }
}
