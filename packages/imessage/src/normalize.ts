import type { NormalizedItem } from '@cortex/core';
import type { IMessageBridgeMessage } from './bridge-client';

/** Map a bridge message into the normalized shape. Pure. Always inbound (read-only). */
export function imessageMessageToNormalized(m: IMessageBridgeMessage): NormalizedItem {
  const handle = m.handle.toLowerCase();
  const snippet = m.text.replace(/\s+/g, ' ').slice(0, 300);
  return {
    source: 'imessage',
    sourceItemId: m.id,
    sourceThreadId: m.chatId,
    direction: 'inbound',
    sender: {
      displayName: m.displayName || m.handle,
      handle,
    },
    recipients: [{ kind: 'from', handle }],
    timestamp: new Date(m.timestamp * 1000),
    ...(m.text ? { bodyText: m.text } : {}),
    bodySnippet: snippet,
    hasAttachments: false,
    attachments: [],
    bulk: false,
    raw: m,
  };
}
