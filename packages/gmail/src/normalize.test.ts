import type { gmail_v1 } from 'googleapis';
import { describe, expect, it } from 'vitest';
import { gmailMessageToNormalized, parseAddress } from './normalize';

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

const message: gmail_v1.Schema$Message = {
  id: 'm1',
  threadId: 't1',
  labelIds: ['INBOX', 'IMPORTANT'],
  snippet: 'Hi — legal is ready, just need your sign-off before EOD',
  internalDate: '1751884800000',
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'From', value: 'Dana Whitfield <Dana@Acme.com>' },
      { name: 'To', value: 'me@op.com' },
      { name: 'Cc', value: '"Raman, Priya" <priya@acme.com>, bob@x.io' },
      { name: 'Subject', value: 'Q3 contract — sign-off' },
    ],
    parts: [
      {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: b64url('Please sign the Q3 contract.\nThanks') } },
          { mimeType: 'text/html', body: { data: b64url('<p>Please sign</p>') } },
        ],
      },
      { mimeType: 'application/pdf', filename: 'contract.pdf', body: { attachmentId: 'att1', size: 21000 } },
    ],
  },
};

describe('gmailMessageToNormalized', () => {
  const n = gmailMessageToNormalized(message);

  it('maps ids, thread, and direction', () => {
    expect(n.source).toBe('gmail');
    expect(n.sourceItemId).toBe('m1');
    expect(n.sourceThreadId).toBe('t1');
    expect(n.direction).toBe('inbound');
  });

  it('parses sender (lowercased) and all recipients, quoted comma included', () => {
    expect(n.sender).toEqual({ displayName: 'Dana Whitfield', handle: 'dana@acme.com' });
    expect(n.recipients).toContainEqual({ kind: 'from', handle: 'dana@acme.com', name: 'Dana Whitfield' });
    expect(n.recipients).toContainEqual({ kind: 'to', handle: 'me@op.com' });
    expect(n.recipients).toContainEqual({ kind: 'cc', handle: 'priya@acme.com', name: 'Raman, Priya' });
    expect(n.recipients).toContainEqual({ kind: 'cc', handle: 'bob@x.io' });
  });

  it('decodes the base64url text body and prefers text/plain', () => {
    expect(n.bodyText).toContain('Please sign the Q3 contract.');
    expect(n.bodyText).not.toContain('<p>');
  });

  it('uses the Gmail-provided snippet', () => {
    expect(n.bodySnippet).toContain('legal is ready');
  });

  it('extracts attachment metadata only (no bytes)', () => {
    expect(n.hasAttachments).toBe(true);
    expect(n.attachments).toEqual([
      { filename: 'contract.pdf', mimeType: 'application/pdf', size: 21000, sourceRef: 'att1' },
    ]);
  });

  it('reads subject and orders by internalDate', () => {
    expect(n.subject).toBe('Q3 contract — sign-off');
    expect(n.timestamp.getTime()).toBe(1751884800000);
  });

  it('flags a personal message as not bulk', () => {
    expect(n.bulk).toBe(false);
  });

  it('marks SENT messages as outbound', () => {
    const sent = gmailMessageToNormalized({ ...message, labelIds: ['SENT'] });
    expect(sent.direction).toBe('outbound');
  });

  it('falls back to HTML→text when there is no text/plain', () => {
    const htmlOnly = gmailMessageToNormalized({
      id: 'm2',
      internalDate: '0',
      payload: {
        headers: [{ name: 'Subject', value: 'x' }],
        mimeType: 'text/html',
        body: { data: b64url('<p>Hello <b>there</b></p>') },
      },
    });
    expect(htmlOnly.bodyText).toBe('Hello there');
  });
});

describe('parseAddress', () => {
  it('name + email', () => expect(parseAddress('Dana <dana@acme.com>')).toEqual({ name: 'Dana', handle: 'dana@acme.com' }));
  it('bare email lowercased', () => expect(parseAddress('Bob@X.io')).toEqual({ handle: 'bob@x.io' }));
});
