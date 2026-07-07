import type { AttachmentMeta, NormalizedItem, Recipient } from '@cortex/core';
import type { gmail_v1 } from 'googleapis';
import { isBulk } from './bulk';

function headerMap(payload: gmail_v1.Schema$MessagePart | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const h of payload?.headers ?? []) {
    if (h.name && h.value != null) m.set(h.name.toLowerCase(), h.value);
  }
  return m;
}

function decodeB64Url(data?: string | null): string {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf8');
}

/** Parse a single `Name <email>` (or bare `email`) address. */
export function parseAddress(raw: string): { name?: string; handle: string } {
  const angled = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1]?.trim();
    return { ...(name ? { name } : {}), handle: angled[2]!.trim().toLowerCase() };
  }
  return { handle: raw.trim().toLowerCase() };
}

/** Split an address-list header on top-level commas (not inside quotes or `<...>`). */
function splitAddressList(raw: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  let inAngle = false;
  for (const ch of raw) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === '<') inAngle = true;
    else if (ch === '>') inAngle = false;
    if (ch === ',' && !inQuote && !inAngle) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseAddressList(raw: string | undefined): Array<{ name?: string; handle: string }> {
  if (!raw) return [];
  return splitAddressList(raw)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseAddress)
    .filter((a) => a.handle.length > 0);
}

/** Minimal HTML → text fallback when a message has no text/plain part. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
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

function collectBody(payload: gmail_v1.Schema$MessagePart | undefined): {
  text: string;
  html: string;
  attachments: AttachmentMeta[];
} {
  let text = '';
  let html = '';
  const attachments: AttachmentMeta[] = [];

  function walk(part: gmail_v1.Schema$MessagePart): void {
    const mime = part.mimeType ?? '';
    const filename = part.filename ?? '';
    const body = part.body ?? {};

    if (filename && (body.attachmentId || (body.size ?? 0) > 0)) {
      attachments.push({
        filename,
        mimeType: mime || 'application/octet-stream',
        ...(body.size != null ? { size: body.size } : {}),
        ...(body.attachmentId ? { sourceRef: body.attachmentId } : {}),
      });
      return;
    }
    if (mime === 'text/plain' && body.data) text += decodeB64Url(body.data);
    else if (mime === 'text/html' && body.data) html += decodeB64Url(body.data);

    for (const child of part.parts ?? []) walk(child);
  }

  if (payload) walk(payload);
  return { text, html, attachments };
}

/**
 * Map a full Gmail message into the normalized shape. Pure — no I/O.
 * Ordering uses `internalDate` (Gmail receipt time), not the sender-supplied
 * `Date` header. Keys are Gmail's `id`/`threadId`, not the RFC Message-ID.
 */
export function gmailMessageToNormalized(msg: gmail_v1.Schema$Message): NormalizedItem {
  const headers = headerMap(msg.payload ?? undefined);
  const { text, html, attachments } = collectBody(msg.payload ?? undefined);

  const bodyText = (text.trim() || htmlToText(html)).trim();
  const snippet = (msg.snippet ?? '').trim() || bodyText.slice(0, 300);

  const from = parseAddress(headers.get('from') ?? '');
  const recipients: Recipient[] = [
    ...(headers.get('from') ? [{ kind: 'from' as const, handle: from.handle, ...(from.name ? { name: from.name } : {}) }] : []),
    ...parseAddressList(headers.get('to')).map((a) => ({ kind: 'to' as const, handle: a.handle, ...(a.name ? { name: a.name } : {}) })),
    ...parseAddressList(headers.get('cc')).map((a) => ({ kind: 'cc' as const, handle: a.handle, ...(a.name ? { name: a.name } : {}) })),
    ...parseAddressList(headers.get('bcc')).map((a) => ({ kind: 'bcc' as const, handle: a.handle, ...(a.name ? { name: a.name } : {}) })),
  ];

  const labels = msg.labelIds ?? [];
  const direction = labels.includes('SENT') ? 'outbound' : 'inbound';
  const timestamp = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(0);

  return {
    source: 'gmail',
    sourceItemId: msg.id ?? '',
    ...(msg.threadId ? { sourceThreadId: msg.threadId } : {}),
    direction,
    sender: {
      displayName: from.name ?? from.handle ?? 'unknown',
      handle: from.handle ?? '',
    },
    recipients,
    timestamp,
    ...(headers.get('subject') ? { subject: headers.get('subject')! } : {}),
    ...(bodyText ? { bodyText } : {}),
    bodySnippet: snippet,
    hasAttachments: attachments.length > 0,
    attachments,
    bulk: isBulk(headers),
    raw: msg,
  };
}
