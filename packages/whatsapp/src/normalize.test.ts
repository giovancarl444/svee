import { describe, expect, it } from 'vitest';
import type { WABridgeMessage } from './bridge-client';
import { whatsappMessageToNormalized } from './normalize';

const msg: WABridgeMessage = {
  seq: 5,
  id: 'wa-abc',
  chatJid: '15551234567@s.whatsapp.net',
  senderJid: '15551234567@s.whatsapp.net',
  pushName: 'Dana',
  timestamp: 1751884800,
  text: 'can you call me back today?',
};

describe('whatsappMessageToNormalized', () => {
  it('maps an incoming message (always inbound, read-only)', () => {
    const n = whatsappMessageToNormalized(msg);
    expect(n.source).toBe('whatsapp');
    expect(n.sourceItemId).toBe('wa-abc');
    expect(n.sourceThreadId).toBe('15551234567@s.whatsapp.net');
    expect(n.direction).toBe('inbound');
    expect(n.sender).toEqual({ displayName: 'Dana', handle: '15551234567@s.whatsapp.net' });
    expect(n.bodyText).toBe('can you call me back today?');
    expect(n.timestamp.getTime()).toBe(1751884800 * 1000);
    expect(n.bulk).toBe(false);
  });

  it('falls back to the phone number when there is no push name', () => {
    const n = whatsappMessageToNormalized({ ...msg, pushName: '' });
    expect(n.sender.displayName).toBe('15551234567');
  });
});
