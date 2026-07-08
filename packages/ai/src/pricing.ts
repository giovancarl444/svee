/**
 * Rough cost estimation for the audit log (spec §4 `api_calls.cost_estimate`).
 * These are advisory only — displayed so the operator can see spend, never used
 * for billing. Rates are USD per 1M tokens.
 *
 * Rates below are grounded in the live-docs research pass (docs/live-docs/anthropic-api.md,
 * verified 2026-07): Opus 4.8 $5/$25, Sonnet 5 $3/$15 (an intro $2/$10 applies through
 * 2026-08-31), Haiku 4.5 $1/$5 per MTok. We use Sonnet's stable post-intro rate so spend
 * is never under-reported. DeepSeek V3.2 (verified 2026-07): $0.28/$0.42 per MTok.
 * Re-check the source pages when pricing drifts.
 *
 * Unknown models (a self-hosted Ollama/Qwen3, say) fall back to $0 — a local
 * model has no per-token cost, so reporting zero is the accurate default.
 */
export interface TokenUsage {
  input?: number;
  output?: number;
}

interface Rate {
  inputPerM: number;
  outputPerM: number;
}

// Rates keyed by model-id prefix — see the VERIFY note above.
const RATES: Array<{ match: string; rate: Rate }> = [
  { match: 'claude-haiku-4-5', rate: { inputPerM: 1, outputPerM: 5 } },
  { match: 'claude-sonnet-5', rate: { inputPerM: 3, outputPerM: 15 } },
  { match: 'claude-opus-4', rate: { inputPerM: 5, outputPerM: 25 } },
  { match: 'deepseek', rate: { inputPerM: 0.28, outputPerM: 0.42 } },
];

// Unknown / self-hosted models: no per-token cost, so report $0.
const FALLBACK: Rate = { inputPerM: 0, outputPerM: 0 };

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const rate = RATES.find((r) => model.startsWith(r.match))?.rate ?? FALLBACK;
  const input = ((usage.input ?? 0) / 1_000_000) * rate.inputPerM;
  const output = ((usage.output ?? 0) / 1_000_000) * rate.outputPerM;
  return Number((input + output).toFixed(6));
}
