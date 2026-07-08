import type { Checkpoint, CheckpointStore, SourceName } from '@cortex/core';
import { describe, expect, it } from 'vitest';
import { IMessageAdapter } from './adapter';
import type { IMessageBridge, IMessageBridgeMessage } from './bridge-client';

const msg = (seq: number): IMessageBridgeMessage => ({
  seq,
  id: `im-${seq}`,
  chatId: 'iMessage;-;+15551234567',
  handle: '+15551234567',
  displayName: 'Dana',
  timestamp: 1751884800,
  text: `message ${seq}`,
  service: 'iMessage',
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

describe('IMessageAdapter', () => {
  it('pulls messages after the checkpoint seq and advances it', async () => {
    const bridge: IMessageBridge = {
      async fetchMessages(since) {
        return [msg(7), msg(8)].filter((m) => m.seq > since);
      },
      async status() {
        return { connected: true, dbReadable: true, account: 'me@icloud.com' };
      },
    };
    const adapter = new IMessageAdapter({ bridge, store: memStore() });

    const raw = await adapter.fetchSince(await adapter.getCheckpoint());
    expect(raw.map((r) => r.sourceItemId)).toEqual(['im-7', 'im-8']);
    expect(await adapter.getCheckpoint()).toEqual({ seq: 8 });

    const n = adapter.normalize(raw[0]!);
    expect(n.source).toBe('imessage');
    expect(n.sourceItemId).toBe('im-7');
  });

  it('reports status from the bridge (dbReadable → authValid)', async () => {
    const bridge: IMessageBridge = {
      async fetchMessages() {
        return [];
      },
      async status() {
        return { connected: true, dbReadable: false };
      },
    };
    const adapter = new IMessageAdapter({ bridge, store: memStore() });
    expect(await adapter.status()).toMatchObject({
      source: 'imessage',
      connected: true,
      authValid: false,
    });
  });
});
