import { buildTriagePayload, classifyTriage, shouldEscalate } from '@cortex/ai';
import { getItemsNeedingTriage, insertClassification } from '@cortex/db';
import { log } from './logger';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

export interface TriageSummary {
  triaged: number;
  escalationCandidates: number;
  failed: number;
}

/**
 * Tier-1 triage (Haiku): classify every item that has no pass yet. The payload
 * is built by the redaction layer (subject + sender + snippet only) and audited.
 * Items the result flags for escalation are counted; the Sonnet re-pass is Phase 3.
 */
export async function runTriage(limit = 100): Promise<TriageSummary> {
  const candidates = await getItemsNeedingTriage(limit);
  const summary: TriageSummary = { triaged: 0, escalationCandidates: 0, failed: 0 };

  for (const c of candidates) {
    try {
      const payload = buildTriagePayload({
        source: c.source,
        senderDisplay: c.senderName ?? 'unknown',
        senderImportance: c.senderImportance ?? 1,
        timestamp: c.timestamp,
        subject: c.subject,
        bodySnippet: c.snippet,
      });
      const { result, model } = await classifyTriage(payload, c.id);
      await insertClassification({
        itemId: c.id,
        model,
        category: result.category,
        urgency: clamp(result.urgency ?? 0, 0, 3),
        requiresAction: Boolean(result.requires_action),
        actionSummary: result.action_summary ?? '',
        deadlineAt: result.deadline ? new Date(result.deadline) : null,
        confidence: typeof result.confidence === 'number' ? result.confidence : 0,
        reasoning: '',
      });
      summary.triaged++;
      if (shouldEscalate(result)) summary.escalationCandidates++;
    } catch (err) {
      summary.failed++;
      log.error({ itemId: c.id, err }, 'triage: failed for item — continuing');
    }
  }

  return summary;
}
