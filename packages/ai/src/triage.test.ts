import { describe, expect, it } from 'vitest';
import { extractJson } from './provider';
import { normalizeTriageResult } from './triage';

describe('normalizeTriageResult (reconciles imperfect local-model output with DB invariants)', () => {
  it('defaults a MISSING category to fyi (the real qwen2.5 NULL-category failure)', () => {
    // Exactly the shape that violated the NOT-NULL constraint at runtime.
    const r = normalizeTriageResult({ urgency: 0, requires_action: false, confidence: 0 } as never);
    expect(r.category).toBe('fyi');
  });

  it('replaces an out-of-vocabulary category with fyi', () => {
    const r = normalizeTriageResult({ category: 'URGENT!!' } as never);
    expect(r.category).toBe('fyi');
  });

  it('keeps a valid category', () => {
    expect(normalizeTriageResult({ category: 'financial' } as never).category).toBe('financial');
  });

  it('drops a non-ISO deadline like "Friday" (avoids inserting an Invalid Date)', () => {
    expect(normalizeTriageResult({ category: 'fyi', deadline: 'Friday' } as never).deadline).toBeNull();
  });

  it('normalizes a parseable deadline to ISO-8601', () => {
    const r = normalizeTriageResult({ category: 'fyi', deadline: '2026-07-09' } as never);
    expect(r.deadline).toBe(new Date('2026-07-09').toISOString());
  });

  it('clamps urgency to 0-3 and confidence to 0-1', () => {
    const r = normalizeTriageResult({ category: 'fyi', urgency: 9, confidence: 5 } as never);
    expect(r.urgency).toBe(3);
    expect(r.confidence).toBe(1);
  });

  it('coerces junk numerics to safe defaults', () => {
    const r = normalizeTriageResult({ category: 'fyi', urgency: 'x', confidence: 'y' } as never);
    expect(r.urgency).toBe(0);
    expect(r.confidence).toBe(0);
  });
});

describe('extractJson (tolerant parse for OpenAI-compatible models)', () => {
  it('strips a <think>…</think> reasoning block before extracting JSON', () => {
    const out = extractJson<{ category: string }>(
      '<think>The user wants me to classify {this}. It is financial.</think>\n{"category":"financial"}',
    );
    expect(out.category).toBe('financial');
  });

  it('handles a ```json fenced block', () => {
    expect(extractJson<{ ok: boolean }>('```json\n{"ok":true}\n```').ok).toBe(true);
  });
});
