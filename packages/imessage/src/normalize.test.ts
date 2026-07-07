import { describe, expect, it } from 'vitest';
import type { IMessageBridgeMessage } from './bridge-client';
import { imessageMessageToNormalized } from './normalize';

const msg: IMessageBridgeMessage = {
  seq: 42,
  id: 'p:0/ABC-GUID',
  chatId: 'iMessage;-;+15551234567',
  handle: '+15551234567',
  displayName: 'Dana',
  timestamp: 1751884800,
  text: 'are we still on for tomorrow?',
  service: 'iMessage',
};

describe('imessageMessageToNormalized', () => {
  it('maps a received message (always inbound, read-only)', () => {
    const n = imessageMessageToNormalized(msg);
    expect(n.source).toBe('imessage');
    expect(n.sourceItemId).toBe('p:0/ABC-GUID');
    expect(n.sourceThreadId).toBe('iMessage;-;+15551234567');
    expect(n.direction).toBe('inbound');
    expect(n.sender).toEqual({ displayName: 'Dana', handle: '+15551234567' });
    expect(n.recipients).toEqual([{ kind: 'from', handle: '+15551234567' }]);
    expect(n.bodyText).toBe('are we still on for tomorrow?');
    expect(n.timestamp.getTime()).toBe(1751884800 * 1000);
    expect(n.bulk).toBe(false);
  });

  it('falls back to the handle when there is no contact name', () => {
    const n = imessageMessageToNormalized({ ...msg, displayName: '' });
    expect(n.sender.displayName).toBe('+15551234567');
  });
});
