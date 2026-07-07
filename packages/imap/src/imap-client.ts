import type { Checkpoint } from '@cortex/core';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/** A parsed IMAP message, source-agnostic (what the adapter normalizes). */
export interface ParsedImapMessage {
  uid: number;
  headers: Map<string, string>; // lowercased key → raw value
  subject?: string;
  from?: { name?: string; address?: string };
  to: Array<{ name?: string; address?: string }>;
  cc: Array<{ name?: string; address?: string }>;
  date?: Date;
  text?: string;
  html?: string;
  messageId?: string;
  references: string[];
  attachments: Array<{ filename: string; contentType: string; size?: number }>;
}

export type ImapCheckpoint = Checkpoint & {
  uidValidity?: string;
  lastSeenUid?: number;
};

/** The connection seam — a fake implements this in tests; the real one uses imapflow. */
export interface ImapFetcher {
  /** Fetch messages with uid > lastSeenUid; returns them + the advanced checkpoint. */
  drainNew(cp: ImapCheckpoint): Promise<{ messages: ParsedImapMessage[]; next: ImapCheckpoint }>;
  status(): Promise<{ connected: boolean; authValid: boolean; detail?: string; error?: string }>;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  mailbox?: string;
}

function headerMapFrom(headerLines: ReadonlyArray<{ key: string; line: string }>): Map<string, string> {
  const m = new Map<string, string>();
  for (const hl of headerLines) {
    const idx = hl.line.indexOf(':');
    m.set(hl.key.toLowerCase(), idx >= 0 ? hl.line.slice(idx + 1).trim() : '');
  }
  return m;
}

function addr(a: { address?: string; name?: string } | undefined) {
  if (!a?.address) return undefined;
  return { ...(a.name ? { name: a.name } : {}), address: a.address.toLowerCase() };
}

async function parseSource(uid: number, source: Buffer): Promise<ParsedImapMessage> {
  const p = await simpleParser(source);
  const refs = Array.isArray(p.references) ? p.references : p.references ? [p.references] : [];
  const toList = p.to ? (Array.isArray(p.to) ? p.to : [p.to]) : [];
  const ccList = p.cc ? (Array.isArray(p.cc) ? p.cc : [p.cc]) : [];
  return {
    uid,
    headers: headerMapFrom(p.headerLines ?? []),
    ...(p.subject ? { subject: p.subject } : {}),
    ...(addr(p.from?.value?.[0]) ? { from: addr(p.from?.value?.[0]) } : {}),
    to: toList.flatMap((t) => (t.value ?? []).map(addr).filter(Boolean)) as ParsedImapMessage['to'],
    cc: ccList.flatMap((c) => (c.value ?? []).map(addr).filter(Boolean)) as ParsedImapMessage['cc'],
    ...(p.date ? { date: p.date } : {}),
    ...(typeof p.text === 'string' ? { text: p.text } : {}),
    ...(typeof p.html === 'string' ? { html: p.html } : {}),
    ...(p.messageId ? { messageId: p.messageId } : {}),
    references: refs,
    attachments: (p.attachments ?? []).map((a) => ({
      filename: a.filename ?? 'attachment',
      contentType: a.contentType ?? 'application/octet-stream',
      ...(typeof a.size === 'number' ? { size: a.size } : {}),
    })),
  };
}

/** Real fetcher backed by imapflow + mailparser. */
export function makeImapFetcher(config: ImapConfig): ImapFetcher {
  const mailbox = config.mailbox ?? 'INBOX';
  const connect = () =>
    new ImapFlow({
      host: config.host,
      port: config.port,
      secure: true,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    });

  return {
    async drainNew(cp) {
      const client = connect();
      await client.connect();
      const messages: ParsedImapMessage[] = [];
      let next: ImapCheckpoint = { ...cp };
      try {
        const lock = await client.getMailboxLock(mailbox);
        try {
          const mb = client.mailbox as { uidValidity: bigint };
          const uidValidity = String(mb.uidValidity);
          // UIDVALIDITY change ⇒ server renumbered UIDs; nothing but a full resync is safe.
          let lastSeenUid = cp.uidValidity === uidValidity ? (cp.lastSeenUid ?? 0) : 0;

          for await (const msg of client.fetch(
            `${lastSeenUid + 1}:*`,
            { uid: true, source: true },
            { uid: true },
          )) {
            // Guard the `N:*` quirk: it always returns the highest message even when
            // N is past the newest UID.
            if (msg.uid <= lastSeenUid) continue;
            if (msg.source) messages.push(await parseSource(msg.uid, msg.source as Buffer));
            lastSeenUid = Math.max(lastSeenUid, msg.uid);
          }
          next = { uidValidity, lastSeenUid };
        } finally {
          lock.release();
        }
      } finally {
        await client.logout();
      }
      return { messages, next };
    },

    async status() {
      const client = connect();
      try {
        await client.connect();
        await client.logout();
        return { connected: true, authValid: true, detail: config.user };
      } catch (err) {
        return { connected: false, authValid: false, error: (err as Error).message };
      }
    },
  };
}
