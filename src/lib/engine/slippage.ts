/**
 * Slippage simulation — constant-product approximation.
 * Pure: same inputs + rng => same output.
 */

import { ENGINE } from "./constants";

export interface SlippageInput {
  tradeUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
}

export interface SlippageResult {
  slippageBps: number;
  /** multiplier applied to reference price; ALWAYS adverse */
  priceMultiplier: number;
  failsLiquidity: boolean;
}

export type Rng = () => number;

/** Mulberry32 — small deterministic PRNG so tests can seed outcomes. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateSlippage(
  input: SlippageInput,
  rng: Rng,
): SlippageResult {
  const S = ENGINE.SLIPPAGE;

  if (!(input.liquidityUsd > 0)) {
    return { slippageBps: S.MAX_BPS, priceMultiplier: 0, failsLiquidity: true };
  }

  // Size impact grows with sqrt(trade/liquidity)
  const sizeImpact =
    Math.pow(input.tradeUsd / input.liquidityUsd, S.SIZE_IMPACT_EXPONENT) *
    S.SIZE_IMPACT_COEFF_BPS;

  // Volatility adjustment
  let volMult = 1.0;
  if (input.volume24hUsd < S.LOW_LIQUIDITY_USD) volMult = S.LOW_VOL_MULT;
  else if (input.volume24hUsd > S.HIGH_VOLUME_USD) volMult = S.HIGH_VOL_MULT;

  const noise =
    S.NOISE_LOW + rng() * (S.NOISE_HIGH - S.NOISE_LOW);

  const rawBps = (S.BASE_BPS + sizeImpact) * volMult * noise;

  // Absurd-size guard: fail rather than fill at a fantasy price
  if (rawBps > S.FAIL_THRESHOLD_BPS || rawBps > S.MAX_BPS) {
    return { slippageBps: rawBps, priceMultiplier: 0, failsLiquidity: true };
  }

  const clampedBps = Math.min(rawBps, S.MAX_BPS);
  return {
    slippageBps: round2(clampedBps),
    priceMultiplier: 1 - clampedBps / 10_000, // adverse side only
    failsLiquidity: false,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
