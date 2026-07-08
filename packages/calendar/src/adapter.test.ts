import type { Checkpoint, CheckpointStore, SourceName } from '@cortex/core';
import type { calendar_v3 } from 'googleapis';
import { beforeEach, describe, expect, it } from 'vitest';
import { CalendarAdapter } from './adapter';
import type { CalendarApi } from './calendar-api';

const ev = (id: string, status = 'confirmed'): calendar_v3.Schema$Event => ({
  id,
  summary: `event ${id}`,
  status,
  start: { dateTime: '2026-07-08T15:00:00Z' },
  end: { dateTime: '2026-07-08T16:00:00Z' },
});

class FakeCalendar implements CalendarApi {
  full: calendar_v3.Schema$Events[] = [];
  incremental: calendar_v3.Schema$Events | Error = { items: [] };
  async listFull(): Promise<calendar_v3.Schema$Events> {
    return this.full.shift() ?? { items: [] };
  }
  async listIncremental(): Promise<calendar_v3.Schema$Events> {
    if (this.incremental instanceof Error) throw this.incremental;
    return this.incremental;
  }
}

function memStore(): CheckpointStore {
  const m = new Map<SourceName, Checkpoint>();
  return {
    async get(s) {
      return m.get(s) ?? {};
    },
    async set(s, c) {
      m.set(s, c);
    },
  };
}

describe('CalendarAdapter', () => {
  let api: FakeCalendar;
  let adapter: CalendarAdapter;

  beforeEach(() => {
    api = new FakeCalendar();
    adapter = new CalendarAdapter({ api, store: memStore() });
  });

  it('full-syncs, skips cancelled events, and captures the sync token', async () => {
    api.full = [{ items: [ev('a'), ev('b', 'cancelled')], nextSyncToken: 'tok1' }];
    const raw = await adapter.fetchSince({});
    expect(raw.map((r) => r.sourceItemId)).toEqual(['a']);
    expect(await adapter.getCheckpoint()).toEqual({ syncToken: 'tok1' });
  });

  it('incremental-syncs from the stored token', async () => {
    api.incremental = { items: [ev('c')], nextSyncToken: 'tok2' };
    const raw = await adapter.fetchSince({ syncToken: 'tok1' });
    expect(raw.map((r) => r.sourceItemId)).toEqual(['c']);
    expect(await adapter.getCheckpoint()).toEqual({ syncToken: 'tok2' });
  });

  it('falls back to a full sync on 410 GONE', async () => {
    api.incremental = Object.assign(new Error('gone'), { code: 410 });
    api.full = [{ items: [ev('a')], nextSyncToken: 'fresh' }];
    const raw = await adapter.fetchSince({ syncToken: 'expired' });
    expect(raw.map((r) => r.sourceItemId)).toEqual(['a']);
    expect(await adapter.getCheckpoint()).toEqual({ syncToken: 'fresh' });
  });
});
