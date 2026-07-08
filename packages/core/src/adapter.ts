import type { SourceName } from './enums';
import type { AdapterStatus, Checkpoint, NormalizedItem, RawItem } from './types';

/**
 * The one interface every source implements (spec §5). Adding a new source =
 * writing one adapter; nothing else in CORTEX changes.
 *
 * The ingestion loop, per source:
 *   getCheckpoint → fetchSince → normalize → upsert (dedupe on sourceItemId)
 *   → advance checkpoint → enqueue new items for triage.
 * `fetchSince` MUST be idempotent — safe to re-run from the same checkpoint.
 * One adapter failing must never break the others: the loop isolates errors
 * per connector and surfaces them via `status()`.
 */
export interface SourceAdapter {
  readonly source: SourceName;

  /** Pull new raw items since the checkpoint. Idempotent. */
  fetchSince(checkpoint: Checkpoint): Promise<RawItem[]>;

  /** Map a raw source payload into the normalized shape. Pure, no I/O. */
  normalize(raw: RawItem): NormalizedItem;

  /** Where we left off, so we never re-pull the whole history. */
  getCheckpoint(): Promise<Checkpoint>;
  setCheckpoint(c: Checkpoint): Promise<void>;

  /** Health/auth status for the dashboard's connector panel. */
  status(): Promise<AdapterStatus>;
}
