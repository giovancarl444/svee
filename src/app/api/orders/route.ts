import { apiOk, apiErr } from "@/lib/api/respond";
import { placeOrderSchema } from "@/lib/validation/orders";
import { fetchTokenQuote } from "@/lib/market-data/dexscreener";
import { executeMarket, type MarketContext } from "@/lib/engine/execute";
import { sampleLatencyMs, sleep } from "@/lib/engine/latency";
import {
  mutateState,
  upsertPosition,
  recordTrade,
  findOpenPosition,
} from "@/lib/store/paper";
import type { Order, Portfolio, Position } from "@/types/trading";

export const dynamic = "force-dynamic";

interface MutationOutcome {
  replay: boolean;
  order?: Order;
  trade?: unknown;
  portfolio?: Portfolio;
  position?: Position;
  failReason?: string;
}

/**
 * POST /api/orders — market orders only in Sprint 0.5.
 * Pipeline: validate → live quote → latency hold → engine fill → persist.
 * Idempotency: one atomic mutation reserves the key and stores the order,
 * so replays return the original result instead of double-spending cash.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiErr(400, "INVALID_PARAMS", "invalid JSON body");
  }

  const parsed = placeOrderSchema.safeParse(body);
  if (!parsed.success) {
    return apiErr(
      400,
      "INVALID_PARAMS",
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  }
  const input = parsed.data;

  // ---- conditional order types land with the matcher tick ------------------
  if (input.orderType !== "market") {
    return apiErr(
      501,
      "NOT_IMPLEMENTED",
      "only market orders are executable until the matcher tick ships",
    );
  }

  // ---- live market context ---------------------------------------------------
  let quote;
  try {
    quote = await fetchTokenQuote(input.chain, input.tokenAddress);
  } catch (e) {
    console.error("[api/orders] quote fetch failed", e);
    return apiErr(502, "MARKET_DATA_DOWN", "provider unreachable");
  }
  if (!quote || !(quote.priceUsd > 0)) {
    return apiErr(502, "MARKET_DATA_DOWN", "no live quote for token");
  }

  // ---- resolve sell size against the open position BEFORE the engine call ----
  let sellPct = input.sellPct;
  if (input.side === "sell" && !sellPct && input.qty) {
    const pos = await findOpenPos(input.chain, input.tokenAddress);
    if (!pos || pos.qty <= 0) {
      return apiErr(409, "NO_POSITION", "nothing to sell");
    }
    sellPct = Math.min(100, Math.max(0.01, (input.qty / pos.qty) * 100));
  }
  const amountUsd = input.side === "buy" ? input.quoteAmount : undefined;

  const pairAgeHours = quote.pairCreatedAtMs
    ? (Date.now() - quote.pairCreatedAtMs) / 3_600_000
    : undefined;

  const market: MarketContext = {
    priceUsd: quote.priceUsd,
    liquidityUsd: quote.liquidityUsd,
    volume24hUsd: quote.volume24h,
    pairAgeHours,
  };

  // ---- simulated latency hold (feels real) ------------------------------------
  const latencyMs = sampleLatencyMs();
  await sleep(latencyMs);

  // ---- run the pure engine + persist under one lock ----------------------------
  const outcome = await mutateState((state): MutationOutcome => {
    // Idempotent replay: key already produced an order → return it unchanged.
    const knownId = state.idempotencyKeys[input.idempotencyKey];
    if (knownId) {
      const prior = state.orders.find((o) => o.id === knownId);
      if (prior) {
        return {
          replay: true,
          order: prior,
          portfolio: state.portfolio,
        };
      }
    }

    const pos = findOpenPosition(state, input.chain, input.tokenAddress);

    const fill = executeMarket({
      side: input.side,
      amountUsd,
      sellPct,
      market,
      cashUsdc: state.portfolio.cashUsdc,
      position: pos
        ? {
            qty: pos.qty,
            avgEntryPrice: pos.avgEntryPrice,
            investedUsdc: pos.investedUsdc,
          }
        : null,
    });

    const baseOrder = {
      side: input.side,
      orderType: "market" as const,
      chain: input.chain,
      tokenAddress: input.tokenAddress,
      tokenSymbol: input.tokenSymbol ?? quote.symbol,
      quoteAmount: input.quoteAmount,
      qty: input.qty,
      sellPct: input.sellPct,
      limitPrice: input.limitPrice,
      stopPrice: input.stopPrice,
      latencyMs,
      createdAt: new Date().toISOString(),
    };

    if (!fill.ok) {
      const failedOrder: Order = {
        ...baseOrder,
        id: newId("ord"),
        status: "failed",
        filledQty: 0,
        feeTotal: 0,
        failReason: fill.failReason,
      };
      state.orders.unshift(failedOrder);
      state.orders = state.orders.slice(0, 300);
      state.idempotencyKeys[input.idempotencyKey] = failedOrder.id;
      return { replay: false, order: failedOrder, failReason: fill.failReason };
    }

    // ---- fill: apply to portfolio + position + ledger -------------------------
    const qty = fill.qty!;
    const execPrice = fill.execPrice!;
    const fees = fill.feeBreakdown!;

    const order: Order = {
      ...baseOrder,
      id: newId("ord"),
      status: "filled",
      filledQty: qty,
      avgFillPrice: execPrice,
      slippageBps: fill.slippageBps,
      feeTotal: fees.total,
    };

    const positionAfter = fill.positionAfter!;
    const savedPosition = upsertPosition(state, {
      chain: input.chain,
      tokenAddress: input.tokenAddress,
      tokenSymbol: order.tokenSymbol,
      tokenName: quote.name,
      qty: positionAfter.qty,
      avgEntryPrice: positionAfter.avgEntryPrice,
      investedUsdc: positionAfter.investedUsdc,
    });

    if (input.side === "buy") {
      state.portfolio.cashUsdc = round2(
        state.portfolio.cashUsdc - (fill.quoteValue! + fees.total),
      );
    } else {
      state.portfolio.cashUsdc = round2(
        state.portfolio.cashUsdc + (fill.quoteValue! - fees.total),
      );
      state.portfolio.realizedPnl = round2(
        state.portfolio.realizedPnl + (fill.realizedPnl ?? 0),
      );
    }
    state.portfolio.feesPaid = round2(state.portfolio.feesPaid + fees.total);

    const trade = recordTrade(state, {
      orderId: order.id,
      side: input.side,
      tokenSymbol: order.tokenSymbol,
      qty,
      price: execPrice,
      quoteValue: fill.quoteValue!,
      fee: fees.total,
      realizedPnl: fill.realizedPnl,
    });

    state.orders.unshift(order);
    state.orders = state.orders.slice(0, 300);
    state.idempotencyKeys[input.idempotencyKey] = order.id;

    return {
      replay: false,
      order,
      trade,
      portfolio: state.portfolio,
      position: savedPosition,
    };
  });

  if (!outcome.replay && !outcome.order) {
    return apiErr(422, outcome.failReason ?? "FAILED", "order failed");
  }
  if (!outcome.order) {
    return apiErr(500, "INTERNAL", "order vanished");
  }

  const failed =
    !outcome.replay &&
    outcome.order.status === "failed";

  return apiOk({
    order: outcome.order,
    trade: outcome.trade ?? null,
    position: outcome.position ?? null,
    portfolio: outcome.portfolio ?? null,
    achievementsUnlocked: [],
  }, failed ? { "x-sim-failed": outcome.failReason ?? "1" } : undefined);
}

async function findOpenPos(chain: string, address: string) {
  const { loadState } = await import("@/lib/store/paper");
  const state = await loadState();
  return findOpenPosition(state, chain, address);
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
