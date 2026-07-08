import { describe, expect, it } from 'vitest';
import {
  MAX_SNIPPET_CHARS,
  buildSynthesisPayload,
  buildTriagePayload,
  dedupeSynthesisInput,
} from './redaction';
import { shouldEscalate, type TriageResult } from './triage';

const base: TriageResult = {
  category: 'fyi',
  urgency: 1,
  requires_action: false,
  action_summary: '',
  deadline: null,
  confidence: 0.9,
};

describe('buildTriagePayload (allowlist — what leaves the box)', () => {
  it('emits ONLY the allowlisted fields and caps the snippet', () => {
    const p = buildTriagePayload({
      source: 'gmail',
      senderDisplay: 'Dana',
      senderImportance: 2,
      timestamp: new Date('2026-07-07T00:00:00Z'),
      subject: 'hi',
      bodySnippet: 'x'.repeat(1000),
    });
    expect(Object.keys(p).sort()).toEqual([
      'sender_display',
      'sender_importance',
      'snippet',
      'source',
      'subject',
      'timestamp',
    ]);
    expect(p.snippet.length).toBeLessThanOrEqual(MAX_SNIPPET_CHARS + 1); // +1 for the ellipsis
    expect(p).not.toHaveProperty('bodyText');
  });
});

describe('dedupeSynthesisInput (collapse near-duplicates before the model)', () => {
  it('collapses same sender+summary actions, keeping the first (most important)', () => {
    const out = dedupeSynthesisInput({
      actions: [
        { source: 'gmail', sender_display: 'Klarna', action_summary: 'Pay invoice', urgency: 3, deadline: '2026-07-01' },
        // near-duplicate: different case / whitespace, same sender + summary
        { source: 'gmail', sender_display: 'klarna', action_summary: 'pay   invoice', urgency: 2, deadline: '2026-07-05' },
        { source: 'gmail', sender_display: 'Klarna', action_summary: 'Update card', urgency: 1, deadline: null },
      ],
      loops: [],
      events: [],
    });
    expect(out.actions).toHaveLength(2);
    // the first (urgency 3) copy of the Klarna invoice wins
    expect(out.actions[0]!.urgency).toBe(3);
    expect(out.actions[1]!.action_summary).toBe('Update card');
  });

  it('collapses same type+description loops and same title+start events', () => {
    const out = dedupeSynthesisInput({
      actions: [],
      loops: [
        { type: 'awaiting_reply_from_operator', description: 'Reply to Dana', due: null },
        { type: 'awaiting_reply_from_operator', description: 'reply to dana', due: '2026-07-02' },
      ],
      events: [
        { title: 'Standup', start: '2026-07-08T09:00', end: null },
        { title: 'Standup', start: '2026-07-08T09:00', end: '2026-07-08T09:15' },
        { title: 'Standup', start: '2026-07-09T09:00', end: null },
      ],
    });
    expect(out.loops).toHaveLength(1);
    // same title, different start → kept as two distinct events
    expect(out.events).toHaveLength(2);
  });

  it('buildSynthesisPayload dedupes without widening the allowlist', () => {
    const p = buildSynthesisPayload({
      eveningDate: '2026-07-07',
      actions: [
        { source: 'gmail', sender_display: 'Klarna', action_summary: 'Pay', urgency: 3, deadline: null },
        { source: 'gmail', sender_display: 'Klarna', action_summary: 'Pay', urgency: 2, deadline: null },
      ],
      loops: [],
      events: [],
    });
    expect(Object.keys(p).sort()).toEqual(['actions', 'evening_date', 'events', 'loops']);
    expect(p.actions).toHaveLength(1);
    expect(Object.keys(p.actions[0]!).sort()).toEqual([
      'action_summary',
      'deadline',
      'sender_display',
      'source',
      'urgency',
    ]);
  });
});

describe('shouldEscalate', () => {
  it('escalates low confidence', () => {
    expect(shouldEscalate({ ...base, confidence: 0.4 })).toBe(true);
  });
  it('escalates money and deadlines', () => {
    expect(shouldEscalate({ ...base, category: 'financial' })).toBe(true);
    expect(shouldEscalate({ ...base, deadline: '2026-07-10' })).toBe(true);
  });
  it('leaves a confident benign item alone', () => {
    expect(shouldEscalate(base)).toBe(false);
  });
});
