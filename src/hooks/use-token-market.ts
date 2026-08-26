"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { TokenQuote } from "@/lib/market-data/dexscreener";

const CHAINS = ["solana", "ethereum", "base", "bnb"] as const;
type Chain = (typeof CHAINS)[number];

/**
 * Polling quote heartbeat for one token — refetch every 4s while visible.
 * Backed by /api/market/price (3s microcache) so multiple components
 * polling the same token share upstream calls.
 */
export function useTokenQuote(chain: Chain, address: string) {
  const key = `${chain}:${address}`;
  return useQuery({
    queryKey: ["quote", key],
    queryFn: () =>
      api<{ quotes: TokenQuote[]; asOf: string }>(
        `/api/market/price?ids=${encodeURIComponent(key)}`,
      ),
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
    enabled: Boolean(chain && address),
    staleTime: 2_000,
    select: (d) => d.quotes.find((q) => q.key === key) ?? null,
  });
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function useCandles(
  chain: Chain,
  address: string,
  timeframe: string,
) {
  return useQuery({
    queryKey: ["candles", chain, address, timeframe],
    queryFn: () =>
      api<{
        candles: Candle[];
        timeframe: string;
        source?: string;
        hint?: string;
      }>(
        `/api/market/candles?chain=${chain}&address=${address}&tf=${timeframe}`,
      ),
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: Boolean(chain && address),
  });
}

/** Invalidate every live-data query after a fill so marks refresh instantly. */
export function useInvalidateTradingData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["quote"] });
    void qc.invalidateQueries({ queryKey: ["positions"] });
    void qc.invalidateQueries({ queryKey: ["trades"] });
    void qc.invalidateQueries({ queryKey: ["me"] });
  };
}

export function isChain(v: string): v is Chain {
  return (CHAINS as readonly string[]).includes(v);
}
