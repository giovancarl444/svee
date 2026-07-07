import type { Checkpoint, CheckpointStore, SourceName } from '@cortex/core';
import { describe, expect, it } from 'vitest';
import { WhatsAppAdapter } from './adapter';
import type { WABridgeMessage, WhatsAppBridge } from './bridge-client';

const msg = (seq: number): WABridgeMessage => ({
  seq,
  id: `wa-${seq}`,
  chatJid: 'chat@s.whatsapp.net',
  senderJid: 'sender@s.whatsapp.net',
  pushName: 'P',
  timestamp: 1751884800,
  text: `message ${seq}`,
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

describe('WhatsAppAdapter', () => {
  it('pulls messages after the checkpoint seq and advances it', async () => {
    const bridge: WhatsAppBridge = {
      async fetchMessages(since) {
        return [msg(3), msg(4)].filter((m) => m.seq > since);
      },
      async status() {
        return { connected: true, loggedIn: true, jid: 'me@s.whatsapp.net' };
      },
    };
    const adapter = new WhatsAppAdapter({ bridge, store: memStore() });

    const raw = await adapter.fetchSince(await adapter.getCheckpoint());
    expect(raw.map((r) => r.sourceItemId)).toEqual(['wa-3', 'wa-4']);
    expect(await adapter.getCheckpoint()).toEqual({ seq: 4 });

    const n = adapter.normalize(raw[0]!);
    expect(n.source).toBe('whatsapp');
    expect(n.sourceItemId).toBe('wa-3');
  });

  it('reports status from the bridge', async () => {
    const bridge: WhatsAppBridge = {
      async fetchMessages() {
        return [];
      },
      async status() {
        return { connected: true, loggedIn: false };
      },
    };
    const adapter = new WhatsAppAdapter({ bridge, store: memStore() });
    expect(await adapter.status()).toMatchObject({ source: 'whatsapp', connected: true, authValid: false });
  });
});
