/**
 * Simulated fee schedule (docs/06 §4).
 * Mirrors what a real bot charges so PnL feels honest.
 */

import { ENGINE } from "./constants";
import { round2 } from "./slippage";

export interface MarketContext {
  volume24hUsd: number;
  /** pair age in hours; undefined treated as old */
  pairAgeHours?: number;
}

export interface FeeBreakdown {
  platform: number;
  network: number;
  mev: number | null;
  total: number;
}

export interface FeeResult extends FeeBreakdown {
  mevApplied: boolean;
}

export function computeFees(
  quoteValueUsd: number,
  ctx: MarketContext,
  rng: { next: () => number },
): FeeResult {
  const F = ENGINE.FEES;

  const platform = round2((quoteValueUsd * F.PLATFORM_PCT) / 100);

  // Network fee sampled log-normally around 0.0004 SOL
  const solUsd = F.SOL_PRICE_FALLBACK_USD;
  const logFactor = Math.exp((rng.next() - 0.5) * 0.8); // ~×0.67..1.50
  const network = round2(F.NETWORK_FEE_SOL * solUsd * logFactor);

  // MEV sandwich risk on brand-new pairs only
  const isNewPair =
    ctx.pairAgeHours !== undefined &&
    ctx.pairAgeHours < ENGINE.FAILURE.NEW_PAIR_AGE_HOURS;
  const mevRoll =
    isNewPair && rng.next() < F.MEV_EVENT_PROB_NEW_PAIRS;
  const mevPct = mevAppliedPct(mevRoll, rng);
  const mev = mevPct !== null ? round2((quoteValueUsd * mevPct) / 100) : null;

  const total = round2(platform + network + (mev ?? 0));
  return { platform, network, mev, total, mevApplied: mev !== null };
}

function mevAppliedPct(rolled: boolean, rng: { next: () => number }): number | null {
  if (!rolled) return null;
  const { MEV_IMPACT_MIN_PCT, MEV_IMPACT_MAX_PCT } = ENGINE.FEES;
  return (
    MEV_IMPACT_MIN_PCT +
    rng.next() * (MEV_IMPACT_MAX_PCT - MEV_IMPACT_MIN_PCT)
  );
}
