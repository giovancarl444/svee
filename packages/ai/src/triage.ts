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

const TRIAGE_SCHEMA: Anthropic.Tool.InputSchema = {
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

const SYSTEM = `You are the triage layer of a personal assistant for a solo operator.
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
    system: SYSTEM,
    payload,
    tool: { name: 'record_triage', description: 'Record the triage classification of one inbound item.', schema: TRIAGE_SCHEMA },
    ...(relatedItemId ? { relatedItemId } : {}),
    maxTokens: 400,
  });
  return { result: data, model };
}
