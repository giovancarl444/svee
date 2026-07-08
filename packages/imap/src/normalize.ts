import { isBulk, type NormalizedItem, type Recipient } from '@cortex/core';
import type { ParsedImapMessage } from './imap-client';

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Map a parsed IMAP message into the normalized shape. Pure. Reply chains are
 * grouped by the References root (or Message-ID) so a thread holds together.
 * The stable per-folder key is `${uidValidity}:${uid}`.
 */
export function imapMessageToNormalized(msg: ParsedImapMessage, uidValidity: string): NormalizedItem {
  const bodyText = (msg.text?.trim() || htmlToText(msg.html ?? '')).trim();
  const snippet = bodyText.replace(/\s+/g, ' ').slice(0, 300);

  const recipients: Recipient[] = [
    ...(msg.from?.address
      ? [{ kind: 'from' as const, handle: msg.from.address, ...(msg.from.name ? { name: msg.from.name } : {}) }]
      : []),
    ...msg.to.map((a) => ({ kind: 'to' as const, handle: a.address!, ...(a.name ? { name: a.name } : {}) })),
    ...msg.cc.map((a) => ({ kind: 'cc' as const, handle: a.address!, ...(a.name ? { name: a.name } : {}) })),
  ];

  const threadRoot = msg.references[0] ?? msg.messageId;

  return {
    source: 'imap',
    sourceItemId: `${uidValidity}:${msg.uid}`,
    ...(threadRoot ? { sourceThreadId: threadRoot } : {}),
    direction: 'inbound',
    sender: {
      displayName: msg.from?.name ?? msg.from?.address ?? 'unknown',
      handle: msg.from?.address ?? '',
    },
    recipients,
    timestamp: msg.date ?? new Date(0),
    ...(msg.subject ? { subject: msg.subject } : {}),
    ...(bodyText ? { bodyText } : {}),
    bodySnippet: snippet,
    hasAttachments: msg.attachments.length > 0,
    attachments: msg.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.contentType,
      ...(a.size != null ? { size: a.size } : {}),
    })),
    bulk: isBulk(msg.headers),
    raw: { uid: msg.uid, uidValidity, messageId: msg.messageId, subject: msg.subject },
  };
}
