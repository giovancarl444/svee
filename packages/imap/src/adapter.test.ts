import type { Checkpoint, CheckpointStore, SourceName } from '@cortex/core';
import { describe, expect, it } from 'vitest';
import { ImapAdapter } from './adapter';
import type { ImapFetcher, ParsedImapMessage } from './imap-client';

const msg = (uid: number): ParsedImapMessage => ({
  uid,
  headers: new Map([['from', `p${uid}@x.io`]]),
  subject: `subject ${uid}`,
  from: { address: `p${uid}@x.io` },
  to: [],
  cc: [],
  date: new Date('2026-07-07T10:00:00Z'),
  text: `body ${uid}`,
  references: [],
  attachments: [],
});

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

describe('ImapAdapter', () => {
  it('drains new messages and advances the checkpoint', async () => {
    const fetcher: ImapFetcher = {
      async drainNew() {
        return { messages: [msg(1), msg(2)], next: { uidValidity: '99', lastSeenUid: 2 } };
      },
      async status() {
        return { connected: true, authValid: true, detail: 'user@host' };
      },
    };
    const adapter = new ImapAdapter({ fetcher, store: memStore() });

    const raw = await adapter.fetchSince(await adapter.getCheckpoint());
    expect(raw.map((r) => r.sourceItemId)).toEqual(['99:1', '99:2']);
    expect(await adapter.getCheckpoint()).toEqual({ uidValidity: '99', lastSeenUid: 2 });

    const n = adapter.normalize(raw[0]!);
    expect(n.source).toBe('imap');
    expect(n.sourceItemId).toBe('99:1');
    expect(n.subject).toBe('subject 1');
  });

  it('reports status from the fetcher', async () => {
    const fetcher: ImapFetcher = {
      async drainNew() {
        return { messages: [], next: {} };
      },
      async status() {
        return { connected: false, authValid: false, error: 'auth failed' };
      },
    };
    const adapter = new ImapAdapter({ fetcher, store: memStore() });
    expect(await adapter.status()).toMatchObject({ source: 'imap', connected: false, lastError: 'auth failed' });
  });
});
