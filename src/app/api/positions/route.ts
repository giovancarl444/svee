import { apiOk } from "@/lib/api/respond";
import { loadState } from "@/lib/store/paper";
import { fetchQuotes } from "@/lib/market-data/dexscreener";
import {
  unrealizedPnl,
  unrealizedPnlPct,
} from "@/lib/engine/pnl";

export const dynamic = "force-dynamic";

/** GET /api/positions — open + closed, with live mark price + uPnL on open ones. */
export async function GET() {
  const state = await loadState();
  const open = state.positions.filter((p) => p.status === "open");
  const closed = state.positions.filter((p) => p.status === "closed");

  // Batch-mark all open positions in one upstream call
  let marks = new Map<string, number>();
  if (open.length > 0) {
    try {
      const quotes = await fetchQuotes(
        open.map((p) => ({ chain: p.chain, address: p.tokenAddress })),
      );
      marks = new Map([...quotes.values()].map((q) => [q.key, q.priceUsd]));
    } catch (e) {
      console.error("[api/positions] mark fetch failed", e);
      // fall through: positions returned unmarked rather than failing outright
    }
  }

  return apiOk({
    open: open.map((p) => {
      const key = `${p.chain}:${p.tokenAddress}`;
      const markPrice = marks.get(key);
      const u = markPrice !== undefined ? unrealizedPnl(p, markPrice) : undefined;
      const uPct =
        markPrice !== undefined ? unrealizedPnlPct(p, markPrice) : undefined;
      return { ...p, markPrice, unrealizedPnl: u, unrealizedPnlPct: uPct };
    }),
    closed,
  });
}
