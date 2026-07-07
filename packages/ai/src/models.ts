import { getEnv } from '@cortex/config';

/**
 * Three tiers, routed by cost/complexity (spec §8). Haiku is the default; earn
 * your way up to Opus. Model strings come from env (defaults pinned by the spec).
 */
export type ModelTier = 'triage' | 'escalate' | 'synthesis';

export function modelFor(tier: ModelTier): string {
  const env = getEnv();
  switch (tier) {
    case 'triage':
      return env.CORTEX_MODEL_TRIAGE;
    case 'escalate':
      return env.CORTEX_MODEL_ESCALATE;
    case 'synthesis':
      return env.CORTEX_MODEL_SYNTHESIS;
  }
}
