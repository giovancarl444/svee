/**
 * Zod schemas shared between the client form and POST /api/orders
 * (docs/05 cross-cutting rules — one definition, no drift).
 */

import { z } from "zod";

const CHAINS = ["solana", "ethereum", "base", "bnb"] as const;

export const placeOrderSchema = z
  .object({
    idempotencyKey: z.string().uuid().or(z.string().min(8)).meta({
      description: "Client-generated retry-safe key",
    }),
    side: z.enum(["buy", "sell"]),
    orderType: z.enum(["market", "limit", "stop_loss", "take_profit"]),
    chain: z.enum(CHAINS),
    tokenAddress: z.string().min(32).max(64),
    tokenSymbol: z.string().min(1).max(16).optional(),
    // BUY
    quoteAmount: z.number().positive().max(1_000_000).optional(),
    // SELL
    qty: z.number().positive().optional(),
    sellPct: z.number().min(1).max(100).optional(),
    // Conditionals
    limitPrice: z.number().positive().optional(),
    stopPrice: z.number().positive().optional(),
    takeProfitPrice: z.number().positive().optional(),
  })
  .refine(
    (v) => !(v.side === "buy" && v.orderType === "market") || !!v.quoteAmount,
    { message: "market buy requires quoteAmount" },
  )
  .refine(
    (v) =>
      !(v.side === "sell" && v.orderType === "market") ||
      !!(v.qty || v.sellPct),
    { message: "market sell requires qty or sellPct" },
  )
  .refine((v) => v.orderType !== "limit" || !!v.limitPrice, {
    message: "limit order requires limitPrice",
  })
  .refine((v) => v.orderType !== "stop_loss" || !!v.stopPrice, {
    message: "stop_loss requires stopPrice",
  })
  .refine((v) => v.orderType !== "take_profit" || !!v.takeProfitPrice, {
    message: "take_profit requires takeProfitPrice",
  });

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
