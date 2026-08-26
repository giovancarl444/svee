/**
 * Resting-order trigger evaluation (docs/06 §5).
 * Pure predicate functions used by the engine tick / repo flush.
 */

import type { Side } from "@/types/trading";

export interface RestingOrderLike {
  side: Side;
  orderType: "limit" | "stop_loss" | "take_profit";
  limitPrice?: number | null;
  stopPrice?: number | null;
  takeProfitPrice?: number | null;
}

export interface TriggerCheck {
  triggered: boolean;
  /** maker-style limit fills AT the limit price; stops/TPs fill at market */
  fillAtLimitPrice: boolean;
}

export function evaluateTrigger(order: RestingOrderLike, lastPrice: number): TriggerCheck {
  switch (order.orderType) {
    case "limit":
      if (order.side === "buy") {
        return { triggered: lastPrice <= (order.limitPrice ?? 0), fillAtLimitPrice: true };
      }
      return { triggered: lastPrice >= (order.limitPrice ?? Infinity), fillAtLimitPrice: true };
    case "stop_loss":
      return { triggered: lastPrice <= (order.stopPrice ?? 0), fillAtLimitPrice: false };
    case "take_profit":
      return {
        triggered: lastPrice >= (order.takeProfitPrice ?? Infinity),
        fillAtLimitPrice: false,
      };
  }
}

export function isExpired(expiresAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now;
}
