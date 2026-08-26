"use client";

import { useMemo, useState } from "react";
import { mulberry32, simulateSlippage } from "@/lib/engine/slippage";
import { fmtPrice, fmtUsd } from "@/lib/format";
import type { TokenQuote } from "@/lib/market-data/dexscreener";
import type { Chain, Position } from "@/types/trading";

interface Props {
  quote: TokenQuote | null;
  cashUsdc: number;
  position: Position | null;
  pending: boolean;
  feedback: { kind: "ok" | "err"; msg: string } | null;
  onSubmit: (req: {
    side: "buy" | "sell";
    chain: Chain;
    tokenAddress: string;
    tokenSymbol?: string;
    quoteAmount?: number;
    sellPct?: number;
  }) => void;
}

const QUICK_BUYS = [100, 500, 1000];

/**
 * Right rail — live market-order ticket.
 * Preview math mirrors the server engine (same pure functions) so the
 * numbers you see before submitting are the ones you'd roughly get.
 */
export function OrderPanel({
  quote,
  cashUsdc,
  position,
  pending,
  feedback,
  onSubmit,
}: Props) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("500");

  const parsedAmount = parseFloat(amount) || 0;

  // ---- preview (engine-faithful approximation) ------------------------------
  const preview = useMemo(() => {
    if (!quote || quote.priceUsd <= 0) return null;
    if (side === "buy") {
      if (!(parsedAmount > 0)) return null;
      const slip = simulateSlippage(
        {
          tradeUsd: parsedAmount,
          liquidityUsd: quote.liquidityUsd,
          volume24hUsd: quote.volume24h,
        },
        mulberry32(42),
      );
      if (slip.failsLiquidity) return null;
      const execPrice = quote.priceUsd / slip.priceMultiplier;
      const platform = (parsedAmount * 0.9) / 100;
      const network = 0.07;
      return {
        impactPct: slip.slippageBps / 100,
        platform,
        network,
        receiveQty: parsedAmount / execPrice,
        totalCost: parsedAmount + platform + network,
      };
    }
    const pct = Math.min(100, Math.max(0, parsedAmount));
    if (!(pct > 0) || !position || position.qty <= 0) return null;
    const sellQty = position.qty * (pct / 100);
    const slip = simulateSlippage(
      {
        tradeUsd: sellQty * quote.priceUsd,
        liquidityUsd: quote.liquidityUsd,
        volume24hUsd: quote.volume24h,
      },
      mulberry32(42),
    );
    if (slip.failsLiquidity) return null;
    const execPrice = quote.priceUsd * slip.priceMultiplier;
    const gross = sellQty * execPrice;
    return {
      impactPct: slip.slippageBps / 100,
      platform: (gross * 0.9) / 100,
      network: 0.07,
      receiveQty: gross - (gross * 0.9) / 100 - 0.07,
      totalCost: gross,
    };
  }, [side, parsedAmount, quote, position]);

  const insufficient =
    side === "buy" &&
    preview !== null &&
    preview.totalCost > cashUsdc;

  const canSubmit =
    quote !== null &&
    !pending &&
    parsedAmount > 0 &&
    !insufficient &&
    (side === "buy" ||
      (position !== null && position.qty > 0));

  function submit() {
    if (!quote) return;
    onSubmit({
      side,
      chain: quote.chain,
      tokenAddress: quote.address,
      tokenSymbol: quote.symbol,
      ...(side === "buy"
        ? { quoteAmount: round2(parsedAmount) }
        : { sellPct: Math.min(100, parsedAmount) }),
    });
  }

  return (
    <div className="panel space-y-3 p-3">
      {/* Buy / Sell switch */}
      <div className="grid grid-cols-2 gap-1 rounded-md bg-surface-1 p-1">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={`btn-press rounded py-1.5 text-sm font-semibold ${
            side === "buy"
              ? "bg-green text-black"
              : "text-fg-muted hover:text-fg-dim"
          }`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={`btn-press rounded py-1.5 text-sm font-semibold ${
            side === "sell"
              ? "bg-red text-black"
              : "text-fg-muted hover:text-fg-dim"
          }`}
        >
          Sell
        </button>
      </div>

      {/* amount */}
      <div>
        <p className="label-caps mb-1.5">
          {side === "buy" ? "Amount · USD" : "Sell · % of position"}
        </p>
        <input
          value={amount}
          onChange={(e) =>
            setAmount(e.target.value.replace(/[^0-9.]/g, ""))
          }
          inputMode="decimal"
          className="num h-10 w-full rounded-md border border-line bg-surface-4 px-3 text-base font-semibold text-fg outline-none focus:border-line-strong"
          placeholder={side === "buy" ? "500.00" : "25"}
        />
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {(side === "buy"
            ? [
                ["25%", 0.25],
                ["50%", 0.5],
                ["75%", 0.75],
                ["Max", 1],
              ]
            : [
                ["25%", 25],
                ["50%", 50],
                ["75%", 75],
                ["100%", 100],
              ]
          ).map(([label, v]) => (
            <button
              key={label as string}
              type="button"
              onClick={() =>
                setAmount(
                  String(
                    side === "buy"
                      ? round2((cashUsdc * (v as number)) as number)
                      : v,
                  ),
                )
              }
              className="num cursor-pointer rounded border border-line bg-surface-3 py-1.5 text-center text-xs text-fg-dim transition-colors hover:border-line-strong hover:text-fg"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* quick buys */}
      {side === "buy" && (
        <div>
          <p className="label-caps mb-1.5">Quick Buy</p>
          <div className="grid grid-cols-3 gap-1.5">
            {QUICK_BUYS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(String(p))}
                className={`num cursor-pointer rounded border py-1.5 text-center text-xs transition-colors ${
                  parsedAmount === p
                    ? "border-accent bg-accent/20 text-fg"
                    : "border-accent/25 bg-accent/10 text-accent hover:border-accent/50"
                }`}
              >
                ${p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* fee preview */}
      {preview && (
        <div className="num space-y-1.5 rounded-md border border-line bg-surface-2 p-3 text-xs text-fg-muted">
          <Row
            label="Price impact"
            value={`${preview.impactPct.toFixed(2)}%`}
            warn={preview.impactPct > 5}
          />
          <Row label="Platform fee" value={fmtUsd(preview.platform)} />
          <Row label="Network fee" value={`~${fmtUsd(preview.network)}`} />
          <div className="flex justify-between border-t border-line pt-1.5 text-fg">
            <span>{side === "buy" ? "You receive" : "You get (net)"}</span>
            <span className="text-green">
              {side === "buy"
                ? `${compact(preview.receiveQty)} ${quote?.symbol ?? ""}`
                : `~${fmtUsd(preview.receiveQty)}`}
            </span>
          </div>
          {insufficient && (
            <p className="pt-1 text-red">
              Insufficient paper USDC — max {fmtUsd(cashUsdc)}
            </p>
          )}
        </div>
      )}

      {/* feedback */}
      {feedback && (
        <p
          className={`num rounded border px-2 py-1.5 text-xs ${
            feedback.kind === "ok"
              ? "border-green/30 bg-green-dim text-green"
              : "border-red/30 bg-red-dim text-red"
          }`}
        >
          {feedback.msg}
        </p>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={submit}
        className={`btn-press w-full rounded-md py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40 ${
          side === "buy"
            ? "bg-green hover:brightness-110"
            : "bg-red hover:brightness-110"
        }`}
      >
        {pending
          ? "Filling…"
          : side === "buy"
            ? `Buy ${quote?.symbol ?? ""}`
            : `Sell ${parsedAmount || 0}%`}
      </button>

      {quote && (
        <p className="num text-center text-[10px] text-fg-muted">
          ref {fmtPrice(quote.priceUsd)} · liq {fmtUsd(quote.liquidityUsd)}
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={warn ? "text-warning" : undefined}>{value}</span>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function compact(q: number): string {
  if (q >= 1_000_000) return `${(q / 1_000_000).toFixed(2)}M`;
  if (q >= 1_000) return `${(q / 1_000).toFixed(1)}K`;
  return q.toFixed(q < 10 ? 4 : 2);
}
