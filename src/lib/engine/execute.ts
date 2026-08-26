/**
 * Execution pipeline (docs/06 §2). Takes current portfolio/position state plus
 * live market context, returns the fill outcome. Pure apart from rng injection.
 */

import { ENGINE } from "./constants";
import { mulberry32, round2, simulateSlippage, type Rng } from "./slippage";
import { computeFees } from "./fees";
import { applyBuy, applySell } from "./pnl";

export interface MarketContext {
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  pairAgeHours?: number;
}

export type FailReason =
  | "MARKET_DATA_DOWN"
  | "INSUFFICIENT_LIQUIDITY"
  | "INSUFFICIENT_BALANCE"
  | "NO_POSITION"
  | "TRANSACTION_FAILED";

export interface FillResult {
  ok: boolean;
  failReason?: FailReason;
  /** executed price after adverse slippage */
  execPrice?: number;
  slippageBps?: number;
  qty?: number;
  quoteValue?: number;
  feeBreakdown?: { platform: number; network: number; mev: number | null; total: number };
  positionAfter?: { qty: number; avgEntryPrice: number; investedUsdc: number };
  realizedPnl?: number;
}

function newPairFailRate(ctx: MarketContext): number {
  if (
    ctx.pairAgeHours !== undefined &&
    ctx.pairAgeHours < ENGINE.FAILURE.NEW_PAIR_AGE_HOURS
  ) {
    return ENGINE.FAILURE.NEW_PAIR_RATE;
  }
  return ENGINE.FAILURE.BASE_RATE;
}

export interface ExecuteArgs {
  side: "buy" | "sell";
  /** BUY: usdc amount. SELL: fraction 0..100 of position */
  amountUsd?: number;
  sellPct?: number;
  market: MarketContext;
  cashUsdc: number;
  position: { qty: number; avgEntryPrice: number; investedUsdc: number } | null;
  seed?: number;
}

export function executeMarket(args: ExecuteArgs): FillResult {
  const rng: Rng = mulberry32(args.seed ?? Math.floor(Math.random() * 2 ** 31));
  const m = args.market;

  if (!(m.priceUsd > 0)) {
    return { ok: false, failReason: "MARKET_DATA_DOWN" };
  }

  // ---- SELL: resolve size against position first --------------------------
  let sellQty = 0;
  if (args.side === "sell") {
    if (!args.position || args.position.qty <= 0) {
      return { ok: false, failReason: "NO_POSITION" };
    }
    const pct = args.sellPct ?? 100;
    sellQty = args.position.qty * (Math.min(100, Math.max(0.01, pct)) / 100);
  }

  // ---- Slippage ------------------------------------------------------------
  const tradeUsd = args.side === "buy" ? (args.amountUsd ?? 0) : sellQty * m.priceUsd;
  const slip = simulateSlippage(
    { tradeUsd, liquidityUsd: m.liquidityUsd, volume24hUsd: m.volume24hUsd },
    rng,
  );
  if (slip.failsLiquidity) {
    return { ok: false, failReason: "INSUFFICIENT_LIQUIDITY" };
  }
  // Buys pay up; sells receive less. Always adverse.
  const execPrice =
    args.side === "buy"
      ? m.priceUsd / slip.priceMultiplier
      : m.priceUsd * slip.priceMultiplier;

  // ---- Fees ----------------------------------------------------------------
  const fees = computeFees(tradeUsd, { volume24hUsd: m.volume24hUsd, pairAgeHours: m.pairAgeHours }, {
    next: rng,
  });

  // ---- Randomized tx failure ----------------------------------------------
  if (rng() < newPairFailRate(m)) {
    return { ok: false, failReason: "TRANSACTION_FAILED" };
  }

  // ---- Apply ---------------------------------------------------------------
  const feeBreakdown = {
    platform: fees.platform,
    network: fees.network,
    mev: fees.mev,
    total: fees.total,
  };

  if (args.side === "buy") {
    const totalCost = round2(tradeUsd + fees.total);
    if (totalCost > args.cashUsdc) {
      return { ok: false, failReason: "INSUFFICIENT_BALANCE" };
    }
    const qty = tradeUsd / execPrice;
    const positionAfter = applyBuy(
      args.position ?? { qty: 0, avgEntryPrice: 0, investedUsdc: 0 },
      qty,
      execPrice,
    );
    if (!positionAfter) return { ok: false, failReason: "INSUFFICIENT_LIQUIDITY" };
    return {
      ok: true,
      execPrice: round6(execPrice),
      slippageBps: slip.slippageBps,
      qty: qty,
      quoteValue: round2(tradeUsd),
      feeBreakdown,
      positionAfter,
      realizedPnl: undefined,
    };
  }

  // SELL
  const pos = args.position!;
  const grossValue = sellQty * execPrice;
  const outcome = applySell(pos, sellQty, execPrice, fees.total);
  return {
    ok: true,
    execPrice: round6(execPrice),
    slippageBps: slip.slippageBps,
    qty: sellQty,
    quoteValue: round2(grossValue),
    feeBreakdown,
    positionAfter: outcome.position,
    realizedPnl: outcome.realizedPnl,
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
