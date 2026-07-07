import { describe, expect, it } from 'vitest';
import { MAX_SNIPPET_CHARS, buildTriagePayload } from './redaction';
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
