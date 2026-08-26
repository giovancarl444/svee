/**
 * All tunable simulation parameters in one place.
 * docs/06-trading-engine-spec.md is the source of truth for these values.
 */

export const ENGINE = {
  /** Simulated network latency bounds (ms) — API holds response this long */
  LATENCY_MIN_MS: 200,
  LATENCY_MAX_MS: 500,

  /** Slippage model (§3) */
  SLIPPAGE: {
    BASE_BPS: 8,
    // calibrated so $500 into $500k liquidity ≈ 40bps (CPMM: 2·ΔB/B)
    SIZE_IMPACT_COEFF_BPS: 1000,
    SIZE_IMPACT_EXPONENT: 0.5,
    MAX_BPS: 5000,
    NOISE_LOW: 0.9,
    NOISE_HIGH: 1.15,
    /** liquidity below this = low-cap volatility multiplier applies */
    LOW_LIQUIDITY_USD: 100_000,
    LOW_VOL_MULT: 1.5,
    HIGH_VOLUME_USD: 10_000_000,
    HIGH_VOL_MULT: 0.8,
    /** beyond this slippage the order fails instead of filling absurdly */
    FAIL_THRESHOLD_BPS: 2500,
  },

  /** Fee schedule (§4) */
  FEES: {
    PLATFORM_PCT: 0.9,
    NETWORK_FEE_SOL: 0.0004,
    SOL_PRICE_FALLBACK_USD: 180,
    MEV_EVENT_PROB_NEW_PAIRS: 0.02,
    MEV_IMPACT_MIN_PCT: 1,
    MEV_IMPACT_MAX_PCT: 5,
  },

  /** Failure rolls (§6) */
  FAILURE: {
    BASE_RATE: 0.015,
    NEW_PAIR_RATE: 0.06,
    NEW_PAIR_AGE_HOURS: 24,
  },

  /** Resting-order matcher (§5) */
  MATCHER: {
    DEFAULT_TTL_DAYS: 7,
    /** stops require confirmation on consecutive ticks (anti-wick) */
    STOP_CONFIRMATION_TICKS: true,
    LIMIT_FILL_NOISE_BPS: 2,
    MAX_STALE_REFERENCE_SEC: 15,
  },
} as const;

export const STARTING_BALANCE_USDC = 10_000;
