import type {
  AdapterStatus,
  Checkpoint,
  CheckpointStore,
  NormalizedItem,
  RawItem,
  SourceAdapter,
} from '@cortex/core';
import type { IMessageBridge, IMessageBridgeMessage } from './bridge-client';
import { imessageMessageToNormalized } from './normalize';

type IMessageCheckpoint = Checkpoint & { seq?: number };

/**
 * Read-only iMessage ingester. Pulls buffered received messages from the local
 * Mac sidecar by monotonic `seq` (chat.db ROWID). The checkpoint advances only
 * after the loop persists (same pending-cursor pattern as the other adapters).
 * Sends nothing.
 */
export class IMessageAdapter implements SourceAdapter {
  readonly source = 'imessage' as const;
  #bridge: IMessageBridge;
  #store: CheckpointStore;
  #pending: IMessageCheckpoint | null = null;

  constructor(deps: { bridge: IMessageBridge; store: CheckpointStore }) {
    this.#bridge = deps.bridge;
    this.#store = deps.store;
  }

  async getCheckpoint(): Promise<Checkpoint> {
    if (this.#pending) return this.#pending;
    return (await this.#store.get('imessage')) as IMessageCheckpoint;
  }

  async setCheckpoint(c: Checkpoint): Promise<void> {
    await this.#store.set('imessage', c);
    this.#pending = null;
  }

  normalize(raw: RawItem): NormalizedItem {
    return imessageMessageToNormalized(raw.payload as IMessageBridgeMessage);
  }

  async fetchSince(checkpoint: Checkpoint): Promise<RawItem[]> {
    const since = (checkpoint as IMessageCheckpoint).seq ?? 0;
    const messages = await this.#bridge.fetchMessages(since);
    const maxSeq = messages.reduce((max, m) => Math.max(max, m.seq), since);
    this.#pending = { seq: maxSeq };
    return messages.map((m) => ({ sourceItemId: m.id, payload: m }));
  }

  async status(): Promise<AdapterStatus> {
    try {
      const s = await this.#bridge.status();
      return {
        source: 'imessage',
        connected: s.connected,
        authValid: s.dbReadable,
        ...(s.account ? { detail: s.account } : {}),
      };
    } catch (err) {
      return { source: 'imessage', connected: false, authValid: false, lastError: (err as Error).message };
    }
  }
}
