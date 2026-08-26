import { create } from "zustand";

/**
 * Client mirror of the server-side portfolio cash balance.
 * Hydrated once by the terminal layout; updated after every fill response.
 * Starts at the standard $10k so the UI never flashes empty.
 */
interface BalanceState {
  cashUsdc: number;
  setCash: (v: number) => void;
}

export const useBalanceStore = create<BalanceState>((set) => ({
  cashUsdc: 10_000,
  setCash: (v) => set({ cashUsdc: v }),
}));
