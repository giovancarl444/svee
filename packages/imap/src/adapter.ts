import type {
  AdapterStatus,
  Checkpoint,
  CheckpointStore,
  NormalizedItem,
  RawItem,
  SourceAdapter,
} from '@cortex/core';
import type { ImapCheckpoint, ImapFetcher, ParsedImapMessage } from './imap-client';
import { imapMessageToNormalized } from './normalize';

interface ImapPayloadShape {
  message: ParsedImapMessage;
  uidValidity: string;
}

/**
 * Read-only IMAP ingester (Constraint §6) — the generic fallback for any
 * non-Gmail mailbox. UID-based incremental sync (UIDVALIDITY + lastSeenUid) is
 * handled inside the injected fetcher; the adapter owns the checkpoint lifecycle
 * (same pending-cursor pattern as the other adapters).
 */
export class ImapAdapter implements SourceAdapter {
  readonly source = 'imap' as const;
  #fetcher: ImapFetcher;
  #store: CheckpointStore;
  #pending: ImapCheckpoint | null = null;

  constructor(deps: { fetcher: ImapFetcher; store: CheckpointStore }) {
    this.#fetcher = deps.fetcher;
    this.#store = deps.store;
  }

  async getCheckpoint(): Promise<Checkpoint> {
    if (this.#pending) return this.#pending;
    return (await this.#store.get('imap')) as ImapCheckpoint;
  }

  async setCheckpoint(c: Checkpoint): Promise<void> {
    await this.#store.set('imap', c);
    this.#pending = null;
  }

  normalize(raw: RawItem): NormalizedItem {
    const { message, uidValidity } = raw.payload as ImapPayloadShape;
    return imapMessageToNormalized(message, uidValidity);
  }

  async fetchSince(checkpoint: Checkpoint): Promise<RawItem[]> {
    const { messages, next } = await this.#fetcher.drainNew(checkpoint as ImapCheckpoint);
    this.#pending = next;
    return messages.map((message) => ({
      sourceItemId: `${next.uidValidity}:${message.uid}`,
      payload: { message, uidValidity: next.uidValidity ?? '' } satisfies ImapPayloadShape,
    }));
  }

  async status(): Promise<AdapterStatus> {
    const s = await this.#fetcher.status();
    return {
      source: 'imap',
      connected: s.connected,
      authValid: s.authValid,
      ...(s.detail ? { detail: s.detail } : {}),
      ...(s.error ? { lastError: s.error } : {}),
    };
  }
}
