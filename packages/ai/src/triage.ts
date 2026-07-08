import { CATEGORIES, type Category } from '@cortex/core';
import type Anthropic from '@anthropic-ai/sdk';
import { structuredCall } from './client';
import { modelFor } from './models';
import type { TriagePayload } from './redaction';

/** The structured result the triage model returns (spec §8). */
export interface TriageResult {
  category: Category;
  urgency: number; // 0-3
  requires_action: boolean;
  action_summary: string;
  deadline: string | null;
  confidence: number;
}

export const CLASSIFICATION_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: [...CATEGORIES] },
    urgency: { type: 'integer', enum: [0, 1, 2, 3], description: '0 ignore, 1 whenever, 2 today/tomorrow, 3 now' },
    requires_action: { type: 'boolean', description: 'does the HUMAN need to do something?' },
    action_summary: { type: 'string', description: 'one imperative line, or "" if none' },
    deadline: { type: ['string', 'null'], description: 'ISO 8601 or null' },
    confidence: { type: 'number', description: '0.0-1.0' },
  },
  required: ['category', 'urgency', 'requires_action', 'action_summary', 'deadline', 'confidence'],
};

export const TRIAGE_SYSTEM = `You are the triage layer of a personal assistant for a solo operator.
You classify ONE inbound item, given as JSON. Be ruthless about what actually
needs the human — most items do not. Weigh the sender_importance
(0 mute, 1 normal, 2 important, 3 VIP).

Record your verdict via the record_triage tool:
- category: one of the allowed values.
- urgency: 0 ignore, 1 whenever, 2 today/tomorrow, 3 now.
- requires_action: does the HUMAN need to DO something (not merely read)?
- action_summary: one imperative line with who/what/deadline, or "" if none.
- deadline: ISO 8601 if the item implies one, else null.
- confidence: 0.0-1.0 in your own classification.

No prose. Only the tool call.`;

const CATEGORY_SET = new Set<string>(CATEGORIES);

/**
 * Coerce a model's raw structured output into a VALID {@link TriageResult}.
 *
 * The pinned Claude tiers honor the tool schema's `enum`/`required`, but local /
 * OpenAI-compatible models (Ollama qwen, DeepSeek, …) do not — they occasionally
 * omit `category`, return an out-of-vocabulary value, or put a natural-language
 * deadline like "Friday" where ISO-8601 is expected. Without this guard those
 * replies violate the `classifications` NOT-NULL/enum constraints (a real failure
 * observed with qwen2.5 on the local provider) or insert an Invalid Date. This is
 * the one place that reconciles imperfect model output with the DB's invariants.
 */
export function normalizeTriageResult(raw: Partial<TriageResult> | null | undefined): TriageResult {
  const r = raw ?? {};
  const category: Category =
    typeof r.category === 'string' && CATEGORY_SET.has(r.category) ? (r.category as Category) : 'fyi';

  const urgencyNum = Number(r.urgency);
  const urgency = Number.isFinite(urgencyNum) ? Math.max(0, Math.min(3, Math.round(urgencyNum))) : 0;

  const confNum = Number(r.confidence);
  const confidence = Number.isFinite(confNum) ? Math.max(0, Math.min(1, confNum)) : 0;

  // Accept an ISO/parseable date; otherwise drop it (never insert an Invalid Date).
  let deadline: string | null = null;
  if (typeof r.deadline === 'string' && r.deadline.trim()) {
    const d = new Date(r.deadline);
    deadline = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return {
    category,
    urgency,
    requires_action: Boolean(r.requires_action),
    action_summary: typeof r.action_summary === 'string' ? r.action_summary : '',
    deadline,
    confidence,
  };
}

/** Whether a triage result should be escalated to the Sonnet tier (Phase 3). */
export function shouldEscalate(r: TriageResult): boolean {
  if (r.confidence < 0.6) return true;
  return r.category === 'financial' || r.deadline != null;
}

/** Tier-1 triage of one allowlisted payload. Cheap, structured, audited. */
export async function classifyTriage(
  payload: TriagePayload,
  relatedItemId?: string,
): Promise<{ result: TriageResult; model: string }> {
  const model = modelFor('triage');
  const { data } = await structuredCall<TriageResult>({
    purpose: 'triage',
    model,
    system: TRIAGE_SYSTEM,
    payload,
    tool: { name: 'record_triage', description: 'Record the triage classification of one inbound item.', schema: CLASSIFICATION_SCHEMA },
    ...(relatedItemId ? { relatedItemId } : {}),
    maxTokens: 400,
  });
  return { result: normalizeTriageResult(data), model };
}
