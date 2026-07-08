import { structuredCall } from './client';
import { modelFor } from './models';
import type { EscalatePayload } from './redaction';
import { CLASSIFICATION_SCHEMA, normalizeTriageResult, type TriageResult } from './triage';

const ESCALATE_SYSTEM = `You are the escalation layer of a personal assistant for a solo operator.
The Haiku triage pass was low-confidence or the item touches money, legal, or a
deadline. Re-classify it with the extra context provided (thread history, notes
on the sender). Same output shape, higher quality — be decisive.

Record your verdict via the record_triage tool:
- category, urgency (0 ignore, 1 whenever, 2 today/tomorrow, 3 now),
  requires_action, action_summary (one imperative line), deadline (ISO 8601 or
  null), confidence (0.0-1.0).

No prose. Only the tool call.`;

/** Tier-2 re-classification (Sonnet) for low-confidence / high-stakes items. */
export async function classifyEscalate(
  payload: EscalatePayload,
  relatedItemId?: string,
): Promise<{ result: TriageResult; model: string }> {
  const model = modelFor('escalate');
  const { data } = await structuredCall<TriageResult>({
    purpose: 'escalate',
    model,
    system: ESCALATE_SYSTEM,
    payload,
    tool: {
      name: 'record_triage',
      description: 'Record the re-classification of one inbound item.',
      schema: CLASSIFICATION_SCHEMA,
    },
    ...(relatedItemId ? { relatedItemId } : {}),
    maxTokens: 600,
  });
  return { result: normalizeTriageResult(data), model };
}
