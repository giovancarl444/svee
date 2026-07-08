import 'server-only';

/**
 * Best-effort "open the real thing" URL for an item, per source. Read-only: this
 * only builds a link the operator can click to jump to the source app — CORTEX
 * never sends or writes. Returns null when there's no useful target.
 */
export function sourceDeepLink(item: {
  source: string;
  sourceItemId?: string | null;
  senderHandle?: string | null;
  calendarUrl?: string | null;
}): string | null {
  switch (item.source) {
    case 'gmail':
      // Gmail resolves a message id after #all/ and opens that conversation.
      return item.sourceItemId
        ? `https://mail.google.com/mail/u/0/#all/${item.sourceItemId}`
        : 'https://mail.google.com/mail/u/0/';
    case 'calendar':
      return item.calendarUrl?.startsWith('http') ? item.calendarUrl : 'https://calendar.google.com/';
    case 'imessage': {
      // `sms:<number>` opens Messages to that chat on Apple devices.
      const digits = (item.senderHandle ?? '').replace(/[^0-9+]/g, '');
      return digits.length >= 6 ? `sms:${digits}` : null;
    }
    case 'imap': // Outlook.com — IMAP has no stable per-message web link; open the inbox.
      return 'https://outlook.live.com/mail/0/';
    default:
      return null;
  }
}
