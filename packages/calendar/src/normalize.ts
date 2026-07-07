import type { NormalizedItem, Recipient } from '@cortex/core';
import type { calendar_v3 } from 'googleapis';

function eventStart(ev: calendar_v3.Schema$Event): Date {
  const s = ev.start?.dateTime ?? ev.start?.date; // date = all-day
  return s ? new Date(s) : new Date(0);
}

/** Map a Google Calendar event into the normalized shape. Pure. */
export function calendarEventToNormalized(ev: calendar_v3.Schema$Event): NormalizedItem {
  const organizer = ev.organizer;
  const attendees: Recipient[] = (ev.attendees ?? [])
    .map((a) => ({
      kind: 'to' as const,
      handle: (a.email ?? '').toLowerCase(),
      ...(a.displayName ? { name: a.displayName } : {}),
    }))
    .filter((a) => a.handle.length > 0);

  const summary = ev.summary ?? '(untitled event)';
  const snippet = ev.location ? `${summary} @ ${ev.location}` : summary;

  return {
    source: 'calendar',
    sourceItemId: ev.id ?? '',
    direction: 'system',
    sender: {
      displayName: organizer?.displayName ?? organizer?.email ?? 'calendar',
      handle: (organizer?.email ?? '').toLowerCase(),
    },
    recipients: attendees,
    timestamp: eventStart(ev),
    ...(ev.summary ? { subject: ev.summary } : {}),
    ...(ev.description ? { bodyText: ev.description } : {}),
    bodySnippet: snippet,
    hasAttachments: false,
    attachments: [],
    bulk: false,
    raw: ev,
  };
}
