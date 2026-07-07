import { textCall } from './client';
import { modelFor } from './models';
import type { SynthesisPayload } from './redaction';

const SYNTHESIS_SYSTEM = `You are the operator's chief of staff. The user message is JSON with the
evening date, the day's action items, open loops, and tomorrow's calendar.
Produce a tight, blunt plan for tomorrow, in Markdown.

Rules:
- Lead with the 1-3 things that genuinely matter. No filler.
- Group the rest under "## Quick replies", "## Waiting on others", "## Can wait".
- Every action is one imperative line. Include who / what / deadline.
- Flag anything at risk of slipping (promised, unanswered, overdue).
- No hedging, no pleasantries. The operator wants signal.
- If nothing is urgent, say so plainly. Do not manufacture work.

Return only the Markdown plan.`;

/** Tier-3 nightly synthesis (Opus): the Tomorrow Plan. Returns Markdown. */
export async function generateTomorrowPlan(
  payload: SynthesisPayload,
): Promise<{ text: string; model: string }> {
  const model = modelFor('synthesis');
  const { text } = await textCall({
    purpose: 'synthesis',
    model,
    system: SYNTHESIS_SYSTEM,
    payload,
    maxTokens: 2000,
  });
  return { text, model };
}
