import { buildEscalatePayload, buildTriagePayload, classifyEscalate, modelFor } from '@cortex/ai';
import { getEscalationCandidates, getThreadSnippets, insertClassification } from '@cortex/db';
import { log } from './logger';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

export interface EscalationSummary {
  escalated: number;
  failed: number;
}

/**
 * Tier-2 escalation (Sonnet): re-classify low-confidence / high-stakes items with
 * thread context + sender notes, appending a second classification pass (never
 * overwriting — the passes stay auditable).
 */
export async function runEscalation(limit = 50): Promise<EscalationSummary> {
  const escalateModel = modelFor('escalate');
  const candidates = await getEscalationCandidates(escalateModel, limit);
  const summary: EscalationSummary = { escalated: 0, failed: 0 };

  for (const c of candidates) {
    try {
      const base = buildTriagePayload({
        source: c.source,
        senderDisplay: c.senderName ?? 'unknown',
        senderImportance: c.senderImportance,
        timestamp: c.timestamp,
        subject: c.subject,
        bodySnippet: c.snippet,
      });
      const threadSnippets = await getThreadSnippets(c.threadId, c.id);
      const payload = buildEscalatePayload({ base, threadSnippets, entityNotes: c.entityNotes });

      const { result, model } = await classifyEscalate(payload, c.id);
      await insertClassification({
        itemId: c.id,
        model,
        category: result.category,
        urgency: clamp(result.urgency ?? 0, 0, 3),
        requiresAction: Boolean(result.requires_action),
        actionSummary: result.action_summary ?? '',
        deadlineAt: result.deadline ? new Date(result.deadline) : null,
        confidence: typeof result.confidence === 'number' ? result.confidence : 0,
        reasoning: 'escalated (tier-2)',
      });
      summary.escalated++;
    } catch (err) {
      summary.failed++;
      log.error({ itemId: c.id, err }, 'escalation: failed for item — continuing');
    }
  }

  return summary;
}
