"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { Chain } from "@/types/trading";
import { fmtPct, fmtUsd } from "@/lib/format";

export interface Callout {
  mint: string;
  symbol: string;
  name?: string;
  source: "firehose" | "whale-mirror";
  sourceHandle?: string;
  calledAt: number;
  calledMcUsd: number;
  score: number;
  reasons: string[];
  socials: string[];
  resolvedAt?: number;
  resolvedMcUsd?: number;
  multiple?: number;
  graduated?: boolean;
  notes?: string;
}

export interface TrackRecord {
  total: number;
  resolved: number;
  wins: number;
  losses: number;
  avgMultiple: number;
  bestMultiple: number;
  winRate: number;
}

export interface CalloutsResponse {
  callouts: Callout[];
  trackRecord: TrackRecord;
  note?: string;
}

export function useCallouts(status?: "open" | "resolved") {
  return useQuery({
    queryKey: ["callouts", status ?? "all"],
    queryFn: () =>
      api<CalloutsResponse>(
        `/api/callouts${status ? `?status=${status}` : ""}`,
      ),
    refetchInterval: 15_000,
  });
}

export function calloutToTradeHref(c: Callout): string {
  return `/trade?chain=solana&address=${c.mint}&symbol=${encodeURIComponent(c.symbol)}`;
}
