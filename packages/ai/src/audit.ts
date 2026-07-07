import { apiCalls, getDb } from '@cortex/db';
import type { TokenUsage } from './pricing';

/**
 * Append one row to `api_calls` for every model call. This is the record that
 * answers "what did CORTEX send to Anthropic about item X?" (spec §10). The
 * `inputSummary` stored here is the exact allowlisted payload that was sent.
 */
export interface ApiCallRecord {
  purpose: string;
  model: string;
  relatedItemId?: string;
  inputSummary: unknown;
  tokenUsage?: TokenUsage | null;
  costEstimate?: number | null;
}

export async function writeApiCall(rec: ApiCallRecord): Promise<void> {
  const db = getDb();
  await db.insert(apiCalls).values({
    purpose: rec.purpose,
    model: rec.model,
    relatedItemId: rec.relatedItemId ?? null,
    inputSummary: rec.inputSummary,
    tokenUsage: rec.tokenUsage ?? null,
    // numeric columns are strings in the pg driver.
    costEstimate: rec.costEstimate != null ? String(rec.costEstimate) : null,
  });
}
