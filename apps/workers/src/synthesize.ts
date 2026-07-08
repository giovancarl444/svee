import { buildSynthesisPayload, generateTomorrowPlan } from '@cortex/ai';
import { getEnv } from '@cortex/config';
import {
  getOpenLoopSummaries,
  getSynthesisActions,
  getTomorrowEvents,
  insertBrief,
  reconcileLoops,
} from '@cortex/db';
import { log } from './logger';

/**
 * Format an instant in the operator's timezone, with a tz label, so the brief
 * reads in local time (e.g. "Wed, Jul 8, 11:00 AM EDT") instead of UTC. Times are
 * not sensitive, so localizing them here does not widen the synthesis allowlist.
 */
function localDateTime(value: Date | string | null | undefined, tz: string): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function eventEnd(raw: unknown, tz: string): string | null {
  const end = (raw as { end?: { dateTime?: string; date?: string } } | null)?.end;
  if (end?.dateTime) return localDateTime(end.dateTime, tz);
  if (end?.date) return end.date; // all-day: a plain calendar date, no tz shift
  return null;
}

function ymd(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export interface SynthesisSummary {
  briefId: string;
  actions: number;
  loops: number;
}

/**
 * Tier-3 nightly synthesis (Opus): reconcile loops, gather the day's action items
 * + open loops (+ tomorrow's calendar in Phase 3), and write the Tomorrow Plan brief.
 */
export async function runSynthesis(now: Date = new Date()): Promise<SynthesisSummary> {
  const tz = getEnv().CORTEX_TZ;
  await reconcileLoops();

  const actions = await getSynthesisActions();
  const loops = await getOpenLoopSummaries();
  // Upcoming events (roughly today + tomorrow) — the brief is written in the evening.
  const events = await getTomorrowEvents(now, new Date(now.getTime() + 48 * 60 * 60 * 1000));

  const payload = buildSynthesisPayload({
    eveningDate: ymd(now, tz),
    actions: actions.map((a) => ({
      source: a.source,
      sender_display: a.senderName ?? 'unknown',
      action_summary: a.actionSummary,
      urgency: a.urgency,
      deadline: localDateTime(a.deadlineAt, tz),
    })),
    loops: loops.map((l) => ({
      type: l.type,
      description: l.description,
      due: localDateTime(l.dueAt, tz),
    })),
    events: events.map((e) => ({
      title: e.title,
      start: localDateTime(e.start, tz) ?? e.start.toISOString(),
      end: eventEnd(e.raw, tz),
    })),
  });

  const { text, model } = await generateTomorrowPlan(payload);
  const forDate = ymd(new Date(now.getTime() + 24 * 60 * 60 * 1000), tz);

  const briefId = await insertBrief({
    kind: 'tomorrow_plan',
    forDate,
    contentMd: text,
    itemsConsidered: actions.map((a) => a.id),
    model,
  });

  log.info({ briefId, actions: actions.length, loops: loops.length, forDate }, 'synthesis complete');
  return { briefId, actions: actions.length, loops: loops.length };
}
