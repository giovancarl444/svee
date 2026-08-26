"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type {
  Order,
  PlaceOrderRequest,
  Position,
} from "@/types/trading";

export interface PositionsResponse {
  open: Position[];
  closed: Position[];
}

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: () => api<PositionsResponse>("/api/positions"),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

export interface PlaceOrderResult {
  order: Order;
  trade: unknown | null;
  position: Position | null;
  portfolio: { cashUsdc: number } | null;
}

/**
 * Market-order mutation. Generates the idempotency key per logical order
 * (retry-safe across network failures) and syncs the balance store on fill.
 */
export function usePlaceMarketOrder(onFilled?: (r: PlaceOrderResult) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      req: Omit<PlaceOrderRequest, "idempotencyKey" | "orderType">,
    ) => {
      const idempotencyKey =
        globalThis.crypto?.randomUUID?.() ??
        `k${Date.now()}${Math.random().toString(16).slice(2)}`;
      return api<PlaceOrderResult>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ ...req, orderType: "market", idempotencyKey }),
      });
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["positions"] });
      void qc.invalidateQueries({ queryKey: ["trades"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["quote"] });
      onFilled?.(data);
    },
  });
}
