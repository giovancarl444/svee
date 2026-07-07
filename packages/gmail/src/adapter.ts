import type {
  AdapterStatus,
  Checkpoint,
  CheckpointStore,
  NormalizedItem,
  RawItem,
  SourceAdapter,
} from '@cortex/core';
import type { gmail_v1 } from 'googleapis';
import { isNotFound, type GmailApi } from './gmail-api';
import { gmailMessageToNormalized } from './normalize';

type GmailCheckpoint = Checkpoint & { historyId?: string };

// Bound the first backfill so a huge inbox doesn't cost thousands of quota units
// on run one. Incremental sync keeps it current after that.
const BACKFILL_QUERY = 'in:inbox newer_than:30d';
const BACKFILL_MAX_IDS = 2000;
const CONCURRENCY = 6; // ~well under the 250 quota-units/sec cap at 20 units/get

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Read-only Gmail ingester (Constraint §6). Full backfill on first run, then
 * historyId incremental sync; a 404 (stale historyId) falls back to a full
 * resync. The checkpoint is only *advanced* by the loop after items persist:
 * `getCheckpoint()` returns the persisted cursor, or — once `fetchSince` has run
 * and computed the next one — the pending cursor, which the loop then commits via
 * `setCheckpoint`. A crash before commit re-fetches (idempotent upsert), never gaps.
 */
export class GmailAdapter implements SourceAdapter {
  readonly source = 'gmail' as const;
  #api: GmailApi;
  #store: CheckpointStore;
  #pending: GmailCheckpoint | null = null;

  constructor(deps: { api: GmailApi; store: CheckpointStore }) {
    this.#api = deps.api;
    this.#store = deps.store;
  }

  async getCheckpoint(): Promise<Checkpoint> {
    if (this.#pending) return this.#pending;
    return (await this.#store.get('gmail')) as GmailCheckpoint;
  }

  async setCheckpoint(c: Checkpoint): Promise<void> {
    await this.#store.set('gmail', c);
    this.#pending = null;
  }

  normalize(raw: RawItem): NormalizedItem {
    return gmailMessageToNormalized(raw.payload as gmail_v1.Schema$Message);
  }

  async fetchSince(checkpoint: Checkpoint): Promise<RawItem[]> {
    const historyId = (checkpoint as GmailCheckpoint).historyId;
    if (!historyId) return this.#backfill();
    try {
      return await this.#incremental(historyId);
    } catch (err) {
      if (isNotFound(err)) return this.#backfill(); // stale cursor → full resync
      throw err;
    }
  }

  async status(): Promise<AdapterStatus> {
    try {
      const profile = await this.#api.getProfile();
      return {
        source: 'gmail',
        connected: true,
        authValid: true,
        ...(profile.emailAddress ? { detail: profile.emailAddress } : {}),
      };
    } catch (err) {
      return {
        source: 'gmail',
        connected: false,
        authValid: false,
        lastError: (err as Error).message,
      };
    }
  }

  async #backfill(): Promise<RawItem[]> {
    // Capture the baseline cursor FIRST so anything arriving during backfill is
    // re-picked-up by the next incremental sync (deduped on upsert) — no gaps.
    const baseline = (await this.#api.getProfile()).historyId ?? undefined;

    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.#api.listMessageIds({
        q: BACKFILL_QUERY,
        maxResults: 500,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const m of res.messages ?? []) if (m.id) ids.push(m.id);
      pageToken = res.nextPageToken ?? undefined;
    } while (pageToken && ids.length < BACKFILL_MAX_IDS);

    const messages = await mapLimit(ids, CONCURRENCY, (id) => this.#api.getMessage(id));
    this.#pending = baseline ? { historyId: baseline } : {};
    return messages.filter((m) => m.id).map((m) => ({ sourceItemId: m.id!, payload: m }));
  }

  async #incremental(startHistoryId: string): Promise<RawItem[]> {
    const changed = new Set<string>();
    let newest = startHistoryId;
    let pageToken: string | undefined;
    do {
      const res = await this.#api.listHistory({
        startHistoryId,
        historyTypes: ['messageAdded'],
        ...(pageToken ? { pageToken } : {}),
      });
      for (const h of res.history ?? []) {
        for (const added of h.messagesAdded ?? []) {
          if (added.message?.id) changed.add(added.message.id);
        }
      }
      if (res.historyId) newest = res.historyId;
      pageToken = res.nextPageToken ?? undefined;
    } while (pageToken);

    const messages = await mapLimit([...changed], CONCURRENCY, (id) => this.#api.getMessage(id));
    this.#pending = { historyId: newest };
    return messages.filter((m) => m.id).map((m) => ({ sourceItemId: m.id!, payload: m }));
  }
}
