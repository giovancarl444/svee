import type {
  AdapterStatus,
  Checkpoint,
  CheckpointStore,
  NormalizedItem,
  RawItem,
  SourceAdapter,
} from '@cortex/core';
import type { calendar_v3 } from 'googleapis';
import { isGone, type CalendarApi } from './calendar-api';
import { calendarEventToNormalized } from './normalize';

type CalendarCheckpoint = Checkpoint & { syncToken?: string };

const WINDOW_DAYS = 14;

/**
 * Read-only Google Calendar ingester. Full sync (bounded window) on first run,
 * then syncToken incremental sync; a 410 (expired token) falls back to a full
 * resync. Cancelled events are skipped. Checkpoint advances only after the loop
 * persists (same pending-cursor pattern as the Gmail adapter).
 */
export class CalendarAdapter implements SourceAdapter {
  readonly source = 'calendar' as const;
  #api: CalendarApi;
  #store: CheckpointStore;
  #pending: CalendarCheckpoint | null = null;

  constructor(deps: { api: CalendarApi; store: CheckpointStore }) {
    this.#api = deps.api;
    this.#store = deps.store;
  }

  async getCheckpoint(): Promise<Checkpoint> {
    if (this.#pending) return this.#pending;
    return (await this.#store.get('calendar')) as CalendarCheckpoint;
  }

  async setCheckpoint(c: Checkpoint): Promise<void> {
    await this.#store.set('calendar', c);
    this.#pending = null;
  }

  normalize(raw: RawItem): NormalizedItem {
    return calendarEventToNormalized(raw.payload as calendar_v3.Schema$Event);
  }

  async fetchSince(checkpoint: Checkpoint): Promise<RawItem[]> {
    const syncToken = (checkpoint as CalendarCheckpoint).syncToken;
    if (!syncToken) return this.#full();
    try {
      return await this.#incremental(syncToken);
    } catch (err) {
      if (isGone(err)) return this.#full();
      throw err;
    }
  }

  async status(): Promise<AdapterStatus> {
    try {
      const now = new Date();
      await this.#api.listFull({
        timeMin: now.toISOString(),
        timeMax: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
      return { source: 'calendar', connected: true, authValid: true };
    } catch (err) {
      return { source: 'calendar', connected: false, authValid: false, lastError: (err as Error).message };
    }
  }

  #collect(events: calendar_v3.Schema$Event[]): RawItem[] {
    return events
      .filter((e) => e.status !== 'cancelled' && e.id)
      .map((e) => ({ sourceItemId: e.id!, payload: e }));
  }

  async #full(): Promise<RawItem[]> {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const raw: RawItem[] = [];
    let pageToken: string | undefined;
    let syncToken: string | undefined;
    do {
      const data = await this.#api.listFull({ timeMin, timeMax, ...(pageToken ? { pageToken } : {}) });
      raw.push(...this.#collect(data.items ?? []));
      pageToken = data.nextPageToken ?? undefined;
      if (data.nextSyncToken) syncToken = data.nextSyncToken;
    } while (pageToken);

    this.#pending = syncToken ? { syncToken } : {};
    return raw;
  }

  async #incremental(startToken: string): Promise<RawItem[]> {
    const raw: RawItem[] = [];
    let pageToken: string | undefined;
    let syncToken = startToken;
    do {
      const data = await this.#api.listIncremental({
        syncToken: startToken,
        ...(pageToken ? { pageToken } : {}),
      });
      raw.push(...this.#collect(data.items ?? []));
      pageToken = data.nextPageToken ?? undefined;
      if (data.nextSyncToken) syncToken = data.nextSyncToken;
    } while (pageToken);

    this.#pending = { syncToken };
    return raw;
  }
}
