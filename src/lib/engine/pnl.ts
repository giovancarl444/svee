/**
 * Average-cost position math + realized/unrealized PnL (docs/06 §7).
 * Fees reduce realized PnL but never distort average entry.
 */

import { round2 } from "./slippage";

export interface PositionState {
  qty: number;
  avgEntryPrice: number;
  investedUsdc: number;
}

/** Apply a BUY fill to position state. Returns null when qty rounds to zero. */
export function applyBuy(
  pos: PositionState,
  fillQty: number,
  fillPrice: number,
): PositionState | null {
  const newQty = pos.qty + fillQty;
  if (newQty <= 0) return null;
  const newInvested = pos.investedUsdc + fillQty * fillPrice;
  return {
    qty: newQty,
    avgEntryPrice: newInvested / newQty,
    investedUsdc: newInvested,
  };
}

export interface SellOutcome {
  position: PositionState;
  realizedPnl: number; // net of sell fees
}

/** Apply a SELL fill. Caller passes fees separately; they hit PnL, not basis. */
export function applySell(
  pos: PositionState,
  soldQty: number,
  sellPrice: number,
  sellFees: number,
): SellOutcome {
  const remainingQty = Math.max(0, pos.qty - soldQty);
  const grossPnl = (sellPrice - pos.avgEntryPrice) * soldQty;
  const costBasisRemoved = pos.avgEntryPrice * soldQty;
  return {
    position: {
      qty: remainingQty,
      avgEntryPrice: remainingQty > 0 ? pos.avgEntryPrice : 0,
      investedUsdc: Math.max(0, pos.investedUsdc - costBasisRemoved),
    },
    realizedPnl: round2(grossPnl - sellFees),
  };
}

export function unrealizedPnl(pos: PositionState, markPrice: number): number {
  return round2((markPrice - pos.avgEntryPrice) * pos.qty);
}

export function unrealizedPnlPct(
  pos: PositionState,
  markPrice: number,
): number {
  if (pos.investedUsdc <= 0) return 0;
  return round2(((markPrice - pos.avgEntryPrice) / pos.avgEntryPrice) * 100);
}

/** Price where the position breaks even AFTER exit fees at platform rate. */
export function breakEvenPrice(
  avgEntryPrice: number,
  platformFeePct: number,
): number {
  return avgEntryPrice / (1 - platformFeePct / 100);
}
