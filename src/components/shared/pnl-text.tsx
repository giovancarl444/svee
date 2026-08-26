"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Signed + colored PnL / percentage text. Green up, red down, neutral zero. */
export function PnlText({
  value,
  suffix = "%",
  className,
  showSign = true,
}: {
  value: number;
  suffix?: "%" | "";
  className?: string;
  showSign?: boolean;
}) {
  const tone =
    value > 0
      ? "text-green"
      : value < 0
        ? "text-red"
        : "text-fg-muted";
  const sign = showSign && value > 0 ? "+" : "";
  const text =
    suffix === "%" ? `${sign}${value.toFixed(1)}%` : `${sign}${value.toFixed(2)}`;
  return <span className={cn("num", tone, className)}>{text}</span>;
}

/** Dollar PnL variant */
export function PnlUsd({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const tone =
    value > 0 ? "text-green" : value < 0 ? "text-red" : "text-fg-muted";
  const sign = value > 0 ? "+$" : value < 0 ? "-$" : "$";
  return (
    <span className={cn("num", tone, className)}>
      {sign}
      {Math.abs(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}
