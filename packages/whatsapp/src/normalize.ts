import type { NormalizedItem } from '@cortex/core';
import type { WABridgeMessage } from './bridge-client';

/** Phone number out of a WA JID like `15551234567@s.whatsapp.net` (for display). */
function phoneFromJid(jid: string): string {
  const at = jid.indexOf('@');
  return at > 0 ? jid.slice(0, at) : jid;
}

/** Map a bridge message into the normalized shape. Pure. Always inbound (read-only). */
export function whatsappMessageToNormalized(m: WABridgeMessage): NormalizedItem {
  const handle = m.senderJid.toLowerCase();
  const snippet = m.text.replace(/\s+/g, ' ').slice(0, 300);
  return {
    source: 'whatsapp',
    sourceItemId: m.id,
    sourceThreadId: m.chatJid,
    direction: 'inbound',
    sender: {
      displayName: m.pushName || phoneFromJid(m.senderJid),
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
