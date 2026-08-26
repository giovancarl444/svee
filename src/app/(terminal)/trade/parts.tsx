"use client";

import { Badge } from "@/components/ui/badge";

/** Left rail: token stats card */
export function TokenStatsGrid() {
  const stats: [string, string][] = [
    ["Market Cap", "$2.84B"],
    ["Liquidity", "$18.4M"],
    ["24h Volume", "$412M"],
    ["Holders", "214,872"],
    ["ATH", "$4.89"],
    ["Vol/MC", "0.14"],
  ];
  return (
    <div className="panel p-3">
      <p className="label-caps mb-2.5">Token Stats</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        {stats.map(([k, v]) => (
          <div key={k}>
            <p className="label-caps text-[10px]">{k}</p>
            <p className="num mt-0.5 text-sm font-medium">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
        <Badge variant="green">LP BURNED 100%</Badge>
        <Badge variant="green">MINT REVOKED</Badge>
        <Badge variant="outline">TOP10 HOLD 22%</Badge>
      </div>
    </div>
  );
}

const TAPE = [
  { side: "Buy", qty: "12.4K WIF", price: "$2.8391", up: true },
  { side: "Sell", qty: "3.1K WIF", price: "$2.8377", up: false },
  { side: "Buy", qty: "48.9K WIF", price: "$2.8402", up: true },
  { side: "Buy", qty: "1.2K WIF", price: "$2.8415", up: true },
  { side: "Sell", qty: "27.6K WIF", price: "$2.8389", up: false },
];

/** Left rail bottom: recent trades tape */
export function TradesFeed() {
  return (
    <div className="panel min-h-0 flex-1 overflow-hidden p-3">
      <p className="label-caps mb-2.5">Recent Trades</p>
      <div className="space-y-1">
        {TAPE.map((t, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <span className={t.up ? "text-green" : "text-red"}>{t.side}</span>
            <span className="num text-fg-dim">{t.qty}</span>
            <span className="num text-fg-muted">{t.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Center chart zone — decorative candles until Lightweight Charts lands in Sprint 1 */
export function ChartPlaceholder() {
  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      {/* timeframe bar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        {["1m", "5m", "15m", "1h", "4h", "1d"].map((tf) => (
          <button
            key={tf}
            className={`num rounded px-2 py-1 text-xs transition-colors ${
              tf === "15m"
                ? "bg-surface-4 text-fg"
                : "text-fg-muted hover:bg-surface-3 hover:text-fg-dim"
            }`}
          >
            {tf}
          </button>
        ))}
        <span className="num ml-auto pr-2 text-xs text-fg-muted">
          WIF / USDC · DEX SIM
        </span>
      </div>
      <svg
        viewBox="0 0 600 300"
        preserveAspectRatio="none"
        className="min-h-0 w-full flex-1"
        aria-hidden
      >
        {CANDLES.map((c, i) => (
          <g key={i}>
            <line
              x1={i * 12 + 6}
              x2={i * 12 + 6}
              y1={c.wickHigh}
              y2={c.wickLow}
              stroke={c.up ? "#00FF88" : "#FF3B3B"}
              strokeWidth="1"
              opacity="0.65"
            />
            <rect
              x={i * 12 + 3}
              y={c.bodyTop}
              width="6"
              height={Math.max(2, c.bodyBottom - c.bodyTop)}
              fill={c.up ? "#00FF88" : "#FF3B3B"}
              rx="1"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Right rail — full order-panel composition mock (Sprint 1 wires live quotes + submit) */
export function OrderPanelMock() {
  return (
    <div className="panel space-y-3 p-3">
      {/* Buy / Sell switch */}
      <div className="grid grid-cols-2 gap-1 rounded-md bg-surface-1 p-1">
        <span className="rounded btn-press bg-green py-1.5 text-center text-sm font-semibold text-black">
          Buy
        </span>
        <span className="btn-press rounded py-1.5 text-center text-sm font-medium text-fg-muted">
          Sell
        </span>
      </div>

      {/* order type tabs */}
      <div className="flex gap-1">
        {["Market", "Limit", "Stop", "TP"].map((t, i) => (
          <span
            key={t}
            className={`label-caps flex-1 rounded py-1.5 text-center ${
              i === 0 ? "bg-surface-4 text-fg" : "text-fg-muted"
            }`}
          >
            {t}
          </span>
        ))}
      </div>

      {/* amount */}
      <div>
        <p className="label-caps mb-1.5">Amount · USD</p>
        <div className="num flex h-10 items-center rounded-md border border-line bg-surface-4 px-3 text-base font-semibold">
          500.00
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {["25%", "50%", "75%", "Max"].map((q) => (
            <span
              key={q}
              className="num cursor-pointer rounded border border-line bg-surface-3 py-1.5 text-center text-xs text-fg-dim hover:border-line-strong hover:text-fg"
            >
              {q}
            </span>
          ))}
        </div>
      </div>

      {/* quick presets */}
      <div>
        <p className="label-caps mb-1.5">Quick Buy</p>
        <div className="grid grid-cols-3 gap-1.5">
          {["$100", "$500", "Snipe $1k"].map((p) => (
            <span
              key={p}
              className="num cursor-pointer rounded border border-accent/25 bg-accent/10 py-1.5 text-center text-xs text-accent hover:border-accent/50"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* fee preview */}
      <div className="num space-y-1.5 rounded-md border border-line bg-surface-2 p-3 text-xs text-fg-muted">
        <div className="flex justify-between">
          <span>Price impact</span>
          <span>0.13%</span>
        </div>
        <div className="flex justify-between">
          <span>Platform fee</span>
          <span>$4.50</span>
        </div>
        <div className="flex justify-between">
          <span>Network fee</span>
          <span>$0.08</span>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5 text-fg">
          <span>You receive</span>
          <span className="text-green">175.42 WIF</span>
        </div>
      </div>

      <button
        className="btn-press w-full rounded-md bg-green py-2.5 text-sm font-semibold text-black hover:brightness-110"
        tabIndex={-1}
      >
        Buy WIF
      </button>
    </div>
  );
}

// Decorative deterministic candlesticks with upward drift
const CANDLES = Array.from({ length: 48 }, (_, i) => {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const r = seed - Math.floor(seed);
  const r2 = (Math.sin(i * 78.233) * 12345.678) % 1;
  const drift = -i * 3.2; // uptrend left→right (y decreases)
  const center = 240 + drift;
  const up = r > 0.42;
  const bodyTop = center - Math.abs(r2) * 26 - 6;
  const bodyBottom = center + Math.abs(r) * 20;
  return {
    up,
    wickHigh: Math.max(6, bodyTop - 14 - r * 10),
    wickLow: Math.min(294, bodyBottom + 14 + r2 * 10),
    bodyTop,
    bodyBottom,
  };
});
