import type {
  AdapterStatus,
  Checkpoint,
  CheckpointStore,
  NormalizedItem,
  RawItem,
  SourceAdapter,
} from '@cortex/core';
import type { WABridgeMessage, WhatsAppBridge } from './bridge-client';
import { whatsappMessageToNormalized } from './normalize';

type WACheckpoint = Checkpoint & { seq?: number };

/**
 * Read-only WhatsApp ingester. Pulls buffered incoming messages from the isolated
 * whatsmeow bridge by monotonic `seq`. The checkpoint advances only after the loop
 * persists (same pending-cursor pattern as the other adapters). Sends nothing.
 */
export class WhatsAppAdapter implements SourceAdapter {
  readonly source = 'whatsapp' as const;
  #bridge: WhatsAppBridge;
  #store: CheckpointStore;
  #pending: WACheckpoint | null = null;

  constructor(deps: { bridge: WhatsAppBridge; store: CheckpointStore }) {
    this.#bridge = deps.bridge;
    this.#store = deps.store;
  }

  async getCheckpoint(): Promise<Checkpoint> {
    if (this.#pending) return this.#pending;
    return (await this.#store.get('whatsapp')) as WACheckpoint;
  }

  async setCheckpoint(c: Checkpoint): Promise<void> {
    await this.#store.set('whatsapp', c);
    this.#pending = null;
  }

  normalize(raw: RawItem): NormalizedItem {
    return whatsappMessageToNormalized(raw.payload as WABridgeMessage);
  }

  async fetchSince(checkpoint: Checkpoint): Promise<RawItem[]> {
    const since = (checkpoint as WACheckpoint).seq ?? 0;
    const messages = await this.#bridge.fetchMessages(since);
    const maxSeq = messages.reduce((max, m) => Math.max(max, m.seq), since);
    this.#pending = { seq: maxSeq };
    return messages.map((m) => ({ sourceItemId: m.id, payload: m }));
  }

  async status(): Promise<AdapterStatus> {
    try {
      const s = await this.#bridge.status();
      return {
        source: 'whatsapp',
        connected: s.connected,
        authValid: s.loggedIn,
        ...(s.jid ? { detail: s.jid } : {}),
      };
    } catch (err) {
      return { source: 'whatsapp', connected: false, authValid: false, lastError: (err as Error).message };
    }
  }
}
