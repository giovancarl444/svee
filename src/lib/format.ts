/**
 * Money / price / percent formatters.
 * All numeric UI text flows through here so the whole terminal
 * renders consistently (mono, tabular, correct precision).
 */

/** $10,000.00 — portfolio cash, trade sizes */
export function fmtUsd(value: number | string, decimals = 2): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "$0.00";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Price with adaptive precision: 4dp under $1, 2dp over $1, sig-figs for dust */
export function fmtPrice(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n) || n === 0) return "$0.00";
  const abs = Math.abs(n);
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs >= 0.01) return `$${n.toFixed(4)}`;
  if (abs >= 0.0001) return `$${n.toFixed(6)}`;
  // Sub-dust memecoin prices: keep 4 significant figures
  return `$${n.toPrecision(4)}`;
}

/** +42.7% / -13.2% — signed, never shows "+" for zero */
export function fmtPct(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0.0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/** 12.5K · 3.2M · 1.1B — volume/market-cap compaction */
export function fmtCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${trimZeros((abs / 1e9).toFixed(2))}B`;
  if (abs >= 1e6) return `${sign}$${trimZeros((abs / 1e6).toFixed(2))}M`;
  if (abs >= 1e3) return `${sign}$${trimZeros((abs / 1e3).toFixed(1))}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function trimZeros(s: string): string {
  return s.replace(/\.?0+$/, "");
}

/** Signed PnL with $ prefix: +$1,234.56 */
export function fmtPnl(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  const sign = value > 0 ? "+" : "";
  return `${sign}${fmtUsd(Math.abs(value)).replace("$", sign === "" ? "" : "")}`;
}

/** Relative time for feeds: "2m ago" */
export function timeAgo(date: Date | string | number): string {
  const t = new Date(date).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
