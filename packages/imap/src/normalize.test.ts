import { describe, expect, it } from 'vitest';
import type { ParsedImapMessage } from './imap-client';
import { imapMessageToNormalized } from './normalize';

const base: ParsedImapMessage = {
  uid: 42,
  headers: new Map([['from', 'Dana <dana@acme.com>']]),
  subject: 'Q3 numbers',
  from: { name: 'Dana', address: 'dana@acme.com' },
  to: [{ address: 'me@op.com' }],
  cc: [],
  date: new Date('2026-07-07T10:00:00Z'),
  text: 'Please review the attached.',
  references: ['<root@acme.com>'],
  messageId: '<msg42@acme.com>',
  attachments: [{ filename: 'q3.pdf', contentType: 'application/pdf', size: 100 }],
};

describe('imapMessageToNormalized', () => {
  it('maps a personal message with the stable uidvalidity:uid key', () => {
    const n = imapMessageToNormalized(base, '99');
    expect(n.source).toBe('imap');
    expect(n.sourceItemId).toBe('99:42');
    expect(n.sourceThreadId).toBe('<root@acme.com>'); // grouped by References root
    expect(n.direction).toBe('inbound');
    expect(n.sender).toEqual({ displayName: 'Dana', handle: 'dana@acme.com' });
    expect(n.recipients).toContainEqual({ kind: 'to', handle: 'me@op.com' });
    expect(n.bodyText).toBe('Please review the attached.');
    expect(n.hasAttachments).toBe(true);
    expect(n.attachments[0]).toMatchObject({ filename: 'q3.pdf', mimeType: 'application/pdf', size: 100 });
    expect(n.bulk).toBe(false);
  });

  it('flags bulk via List-Unsubscribe and falls back to HTML text', () => {
    const n = imapMessageToNormalized(
      {
        ...base,
        headers: new Map([['list-unsubscribe', '<mailto:u@acme.com>']]),
        text: undefined,
        html: '<p>Weekly <b>digest</b></p>',
      },
      '99',
    );
    expect(n.bulk).toBe(true);
    expect(n.bodyText).toBe('Weekly digest');
  });
});
