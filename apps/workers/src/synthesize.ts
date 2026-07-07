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

function eventEnd(raw: unknown): string | null {
  const end = (raw as { end?: { dateTime?: string; date?: string } } | null)?.end;
  return end?.dateTime ?? end?.date ?? null;
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
      deadline: a.deadlineAt ? a.deadlineAt.toISOString() : null,
    })),
    loops: loops.map((l) => ({
      type: l.type,
      description: l.description,
      due: l.dueAt ? l.dueAt.toISOString() : null,
    })),
    events: events.map((e) => ({
      title: e.title,
      start: e.start.toISOString(),
      end: eventEnd(e.raw),
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
