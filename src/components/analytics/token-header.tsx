"use client";

import { Badge } from "@/components/ui/badge";
import { PriceFlash } from "@/components/shared/price-flash";
import {
  fmtCompactUsd,
  fmtPct,
  fmtPrice,
  fmtUsd,
} from "@/lib/format";
import type { TokenQuote } from "@/lib/market-data/dexscreener";
import type { Trade } from "@/types/trading";

/** Token header strip — live price + changes. */
export function TokenHeader({ quote }: { quote: TokenQuote | null }) {
  if (!quote) {
    return (
      <div className="panel flex h-14 shrink-0 items-center gap-4 px-4">
        <span className="num text-sm text-fg-muted">loading token…</span>
        <Badge variant="blue" className="ml-auto">
          SIMULATED EXECUTION
        </Badge>
      </div>
    );
  }
  const chg = quote.changeH24;
  const ageDays = quote.pairCreatedAtMs
    ? Math.floor((Date.now() - quote.pairCreatedAtMs) / 86_400_000)
    : null;

  return (
    <div className="panel flex h-14 shrink-0 items-center gap-4 px-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-4 text-xs font-bold">
        {quote.symbol.slice(0, 4).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{quote.name}</span>
          <Badge variant="blue">{quote.chain.toUpperCase()}</Badge>
        </div>
        <span className="num text-[11px] text-fg-muted">
          {shortAddr(quote.address)}
          {ageDays !== null ? ` · Pair age ${ageDays}d` : ""}
        </span>
      </div>
      <div className="ml-6 num">
        <PriceFlash value={quote.priceUsd} format={fmtPrice} />
        <div className={`text-xs ${chg >= 0 ? "text-green" : "text-red"}`}>
          {fmtPct(chg)} 24h
        </div>
      </div>
      <Badge variant="green" className="ml-auto">
        LIVE · SIM EXECUTION
      </Badge>
    </div>
  );
}

/** Left rail top: live stats card. */
export function TokenStats({ quote }: { quote: TokenQuote | null }) {
  const stats: [string, string][] = quote
    ? [
        ["Market Cap", fmtCompactUsd(quote.marketCap)],
        ["Liquidity", fmtCompactUsd(quote.liquidityUsd)],
        ["24h Volume", fmtCompactUsd(quote.volume24h)],
        ["5m", fmtPct(quote.changeM5)],
        ["1h", fmtPct(quote.changeH1)],
        ["24h", fmtPct(quote.changeH24)],
      ]
    : Array.from({ length: 6 }, () => ["—", "…"] as [string, string]);

  return (
    <div className="panel p-3">
      <p className="label-caps mb-2.5">Token Stats</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        {stats.map(([k, v]) => (
          <div key={k}>
            <p className="label-caps text-[10px]">{k}</p>
            <p
              className={`num mt-0.5 text-sm font-medium ${
                k === "5m" || k === "1h" || k === "24h"
                  ? v.startsWith("+")
                    ? "text-green"
                    : v.startsWith("-")
                      ? "text-red"
                      : ""
                  : ""
              }`}
            >
              {v}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Left rail bottom: your fills on this token (live ledger slice). */
export function FillsFeed({
  trades,
  symbol,
}: {
  trades: Trade[];
  symbol?: string;
}) {
  const rows = trades.filter((t) => !symbol || t.tokenSymbol === symbol).slice(0, 12);
  return (
    <div className="panel min-h-0 flex-1 overflow-hidden p-3">
      <p className="label-caps mb-2.5">Your Fills</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-fg-muted">No fills yet — place a trade.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between text-[11px]"
            >
              <span className={t.side === "buy" ? "text-green" : "text-red"}>
                {t.side === "buy" ? "Buy" : "Sell"}
              </span>
              <span className="num text-fg-dim">{compactQty(t.qty)}</span>
              <span className="num text-fg-muted">{fmtPrice(t.price)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

function compactQty(q: number): string {
  if (q >= 1_000_000) return `${(q / 1_000_000).toFixed(2)}M`;
  if (q >= 1_000) return `${(q / 1_000).toFixed(1)}K`;
  return q.toFixed(q < 10 ? 3 : 1);
}
