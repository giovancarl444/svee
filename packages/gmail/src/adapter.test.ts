import type { Checkpoint, CheckpointStore, SourceName } from '@cortex/core';
import type { gmail_v1 } from 'googleapis';
import { beforeEach, describe, expect, it } from 'vitest';
import { GmailAdapter } from './adapter';
import type { GmailApi } from './gmail-api';

const msg = (id: string): gmail_v1.Schema$Message => ({
  id,
  threadId: `thread-${id}`,
  labelIds: ['INBOX'],
  internalDate: '1751884800000',
  snippet: `snippet ${id}`,
  payload: { headers: [{ name: 'Subject', value: `subject ${id}` }], mimeType: 'text/plain', body: { data: '' } },
});

class FakeGmail implements GmailApi {
  profileHistoryId = '100';
  pages: gmail_v1.Schema$ListMessagesResponse[] = [];
  messages: Record<string, gmail_v1.Schema$Message> = {};
  history: gmail_v1.Schema$ListHistoryResponse | Error = { history: [] };
  fetched: string[] = [];

  async getProfile(): Promise<gmail_v1.Schema$Profile> {
    return { historyId: this.profileHistoryId, emailAddress: 'me@op.com' };
  }
  async listMessageIds(): Promise<gmail_v1.Schema$ListMessagesResponse> {
    return this.pages.shift() ?? { messages: [] };
  }
  async getMessage(id: string): Promise<gmail_v1.Schema$Message> {
    this.fetched.push(id);
    return this.messages[id] ?? { id };
  }
  async listHistory(): Promise<gmail_v1.Schema$ListHistoryResponse> {
    if (this.history instanceof Error) throw this.history;
    return this.history;
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

describe('GmailAdapter', () => {
  let api: FakeGmail;
  let store: CheckpointStore;
  let adapter: GmailAdapter;

  beforeEach(() => {
    api = new FakeGmail();
    store = memStore();
    adapter = new GmailAdapter({ api, store });
  });

  it('backfills when there is no checkpoint, then advances to the baseline historyId', async () => {
    api.pages = [{ messages: [{ id: 'm1' }, { id: 'm2' }] }];
    api.messages = { m1: msg('m1'), m2: msg('m2') };

    expect(await adapter.getCheckpoint()).toEqual({});
    const raw = await adapter.fetchSince({});
    expect(raw.map((r) => r.sourceItemId)).toEqual(['m1', 'm2']);

    // baseline captured BEFORE listing, so nothing added during backfill is missed
    const next = await adapter.getCheckpoint();
    expect(next).toEqual({ historyId: '100' });
    await adapter.setCheckpoint(next);
    expect(await store.get('gmail')).toEqual({ historyId: '100' });
  });

  it('does an incremental sync from the stored historyId', async () => {
    api.history = { history: [{ messagesAdded: [{ message: { id: 'm3' } }] }], historyId: '150' };
    api.messages = { m3: msg('m3') };

    const raw = await adapter.fetchSince({ historyId: '100' });
    expect(raw.map((r) => r.sourceItemId)).toEqual(['m3']);
    expect(await adapter.getCheckpoint()).toEqual({ historyId: '150' });
  });

  it('falls back to a full resync when history.list returns 404', async () => {
    api.history = Object.assign(new Error('gone'), { code: 404 });
    api.pages = [{ messages: [{ id: 'm1' }] }];
    api.messages = { m1: msg('m1') };

    const raw = await adapter.fetchSince({ historyId: 'stale' });
    expect(raw.map((r) => r.sourceItemId)).toEqual(['m1']);
    expect(await adapter.getCheckpoint()).toEqual({ historyId: '100' });
  });

  it('normalize delegates to the pure mapper', () => {
    const n = adapter.normalize({ sourceItemId: 'm1', payload: msg('m1') });
    expect(n.source).toBe('gmail');
    expect(n.subject).toBe('subject m1');
  });
});
