"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  TokenHeader,
  TokenStats,
  FillsFeed,
} from "@/components/analytics/token-header";
import { PriceChart } from "@/components/chart/price-chart";
import { OrderPanel } from "@/components/order-panel/order-panel";
import { useTokenQuote, useCandles } from "@/hooks/use-token-market";
import { usePositions, usePlaceMarketOrder } from "@/hooks/use-orders";
import { useBalanceStore } from "@/stores/balance-store";
import { api } from "@/lib/api/client";
import { fmtPnl, fmtPct } from "@/lib/format";
import type { Trade } from "@/types/trading";
import type { PlaceOrderRequest } from "@/types/trading";
import type { Chain } from "@/types/trading";

/** Default instrument until search/routing lands.
 *  BONK chosen as default because its Raydium pool has full GT OHLCV
 *  coverage (WIF's only venue is an Orca CLMM — quotes fine, no candles). */
const DEFAULT = {
  chain: "solana" as const,
  address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  symbol: "BONK",
};
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

/**
 * Flagship view — the Axiom-style three-zone terminal:
 * [token analytics | chart | order panel] + bottom tape. All live.
 */
export default function TradePage() {
  const searchParams = useSearchParams();
  // Allow ?address=&symbol=&chain= to deep-link a token (e.g. from Callouts).
  const DEFAULT = useMemo<{ chain: Chain; address: string; symbol: string }>(() => {
    const addr = searchParams.get("address");
    const sym = searchParams.get("symbol");
    const ch = searchParams.get("chain");
    if (addr && sym) {
      const chain: Chain =
        ch === "ethereum" || ch === "base" || ch === "bnb" ? (ch as Chain) : "solana";
      return { chain, address: addr, symbol: sym };
    }
    return {
      chain: "solana",
      address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      symbol: "BONK",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const { chain, address, symbol } = DEFAULT;
  const [timeframe, setTimeframe] = useState("15m");

  const quoteQuery = useTokenQuote(chain, address);
  const candlesQuery = useCandles(chain, address, timeframe);
  const positionsQuery = usePositions();
  const tradesQuery = useQuery({
    queryKey: ["trades"],
    queryFn: () => api<{ trades: Trade[] }>("/api/trades?limit=50"),
    refetchInterval: 5_000,
  });
  const cashUsdc = useBalanceStore((s) => s.cashUsdc);
  const setCash = useBalanceStore((s) => s.setCash);

  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "err"; msg: string } | null
  >(null);

  const quote = quoteQuery.data ?? null;

  // hydrate cash from the authoritative ledger on mount
  useEffect(() => {
    let alive = true;
    api<{ portfolio: { cashUsdc: number } }>("/api/me")
      .then((d) => {
        if (alive) setCash(d.portfolio.cashUsdc);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [setCash]);

  const position = useMemo(() => {
    const open = positionsQuery.data?.open ?? [];
    return (
      open.find(
        (p) =>
          p.chain === chain &&
          p.tokenAddress.toLowerCase() === address.toLowerCase(),
      ) ?? null
    );
  }, [positionsQuery.data, chain, address]);

  const placeOrder = usePlaceMarketOrder();

  async function onSubmit(
    req: Omit<PlaceOrderRequest, "idempotencyKey" | "orderType">,
  ) {
    setPending(true);
    setFeedback(null);
    try {
      const r = await placeOrder.mutateAsync(req);
      if (r.order.status === "filled") {
        const pnl =
          r.trade && typeof r.trade === "object" && "realizedPnl" in r.trade
            ? (r.trade.realizedPnl as number | undefined)
            : undefined;
        setFeedback({
          kind: "ok",
          msg: `Filled ${req.side} ${fmtQty(r.order.filledQty)} ${symbol} @ $${r.order.avgFillPrice} · ${r.order.slippageBps}bps · ${r.order.latencyMs}ms${
            pnl !== undefined && req.side === "sell" ? ` · PnL ${fmtPnl(pnl)}` : ""
          }`,
        });
        if (r.portfolio) setCash(r.portfolio.cashUsdc);
      } else {
        setFeedback({
          kind: "err",
          msg: `Order failed: ${r.order.failReason ?? "unknown"}`,
        });
      }
    } catch (e) {
      setFeedback({
        kind: "err",
        msg: e instanceof Error ? e.message : "order rejected",
      });
    } finally {
      setPending(false);
      setTimeout(() => setFeedback(null), 8_000);
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <TokenHeader quote={quote} />

      {/* main three-zone grid */}
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-2">
        {/* left rail: analytics */}
        <div className="col-span-3 flex min-h-0 flex-col gap-2 overflow-auto pr-0.5">
          <TokenStats quote={quote} />
          <FillsFeed trades={tradesQuery.data?.trades ?? []} symbol={symbol} />
        </div>

        {/* center: chart */}
        <div className="col-span-6 min-h-0">
          <div className="flex h-full min-h-0 flex-col gap-1">
            <div className="panel flex h-9 shrink-0 items-center gap-1 px-2">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`num rounded px-2 py-1 text-xs transition-colors ${
                    tf === timeframe
                      ? "bg-surface-4 text-fg"
                      : "text-fg-muted hover:bg-surface-3 hover:text-fg-dim"
                  }`}
                >
                  {tf}
                </button>
              ))}
              <span className="num ml-auto pr-2 text-xs text-fg-muted">
                {symbol} / USDC · LIVE OHLCV
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <PriceChart
                candles={candlesQuery.data?.candles}
                isLoading={candlesQuery.isLoading}
                error={
                  candlesQuery.error instanceof Error
                    ? candlesQuery.error.message
                    : null
                }
                symbol={symbol}
                hint={candlesHint(candlesQuery.data?.source)}
              />
            </div>
          </div>
        </div>

        {/* right rail: order panel */}
        <div className="col-span-3 min-h-0 overflow-auto pl-0.5">
          <OrderPanel
            quote={quote}
            cashUsdc={cashUsdc}
            position={position}
            pending={pending || placeOrder.isPending}
            feedback={feedback}
            onSubmit={onSubmit}
          />
        </div>
      </div>

      {/* bottom tape: your open positions */}
      <div className="panel flex h-9 shrink-0 items-center gap-5 overflow-x-auto px-4">
        <span className="label-caps shrink-0">Positions</span>
        {(positionsQuery.data?.open.length ?? 0) === 0 ? (
          <span className="text-xs text-fg-muted">
            No open positions — buy something.
          </span>
        ) : (
          positionsQuery.data!.open.map((p) => (
            <span
              key={p.id}
              className="num flex shrink-0 items-center gap-1.5 text-xs"
            >
              <span className="font-semibold">{p.tokenSymbol}</span>
              <span className="text-fg-dim">{fmtQty(p.qty)}</span>
              <span
                className={
                  (p.unrealizedPnlPct ?? 0) >= 0 ? "text-green" : "text-red"
                }
              >
                {fmtPct(p.unrealizedPnlPct ?? 0)}
              </span>
            </span>
          ))
        )}
        <Badge variant="outline" className="ml-auto shrink-0">
          SIM EXECUTION
        </Badge>
      </div>
    </div>
  );
}

function fmtQty(q: number): string {
  if (q >= 1_000_000) return `${(q / 1_000_000).toFixed(2)}M`;
  if (q >= 1_000) return `${(q / 1_000).toFixed(1)}K`;
  return q.toFixed(2);
}

function candlesHint(source?: string): string | undefined {
  if (source === "none") {
    return "chart warming up — live candles build as the feed ticks";
  }
  return undefined;
}
