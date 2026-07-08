import type { calendar_v3 } from 'googleapis';
import { describe, expect, it } from 'vitest';
import { calendarEventToNormalized } from './normalize';

describe('calendarEventToNormalized', () => {
  it('maps a timed event to the normalized shape', () => {
    const ev: calendar_v3.Schema$Event = {
      id: 'ev1',
      summary: 'Design review',
      location: 'Room 4',
      description: 'Go over the Q3 mockups',
      status: 'confirmed',
      start: { dateTime: '2026-07-08T15:00:00Z' },
      end: { dateTime: '2026-07-08T16:00:00Z' },
      organizer: { email: 'Dana@Acme.com', displayName: 'Dana' },
      attendees: [{ email: 'me@op.com', displayName: 'Me' }, { email: '' }],
    };
    const n = calendarEventToNormalized(ev);
    expect(n.source).toBe('calendar');
    expect(n.sourceItemId).toBe('ev1');
    expect(n.direction).toBe('system');
    expect(n.subject).toBe('Design review');
    expect(n.timestamp.toISOString()).toBe('2026-07-08T15:00:00.000Z');
    expect(n.sender).toEqual({ displayName: 'Dana', handle: 'dana@acme.com' });
    expect(n.recipients).toEqual([{ kind: 'to', handle: 'me@op.com', name: 'Me' }]);
    expect(n.bodySnippet).toBe('Design review @ Room 4');
    expect(n.bulk).toBe(false);
  });

  it('handles all-day events (date, not dateTime)', () => {
    const n = calendarEventToNormalized({ id: 'ev2', summary: 'Holiday', start: { date: '2026-07-09' } });
    expect(n.subject).toBe('Holiday');
    expect(n.timestamp.toISOString().slice(0, 10)).toBe('2026-07-09');
  });
});
