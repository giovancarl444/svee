import type { SourceName } from './enums';
import type { Checkpoint } from './types';

/**
 * The persistence an adapter needs for its resume cursor, injected so adapters
 * stay DB-agnostic and unit-testable. The DB-backed implementation lives in
 * `@cortex/db` (the `connectors` table); tests pass an in-memory one.
 */
export interface CheckpointStore {
  get(source: SourceName): Promise<Checkpoint>;
  set(source: SourceName, checkpoint: Checkpoint): Promise<void>;
}
