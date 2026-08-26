import { apiOk } from "@/lib/api/respond";
import { loadState } from "@/lib/store/paper";

export const dynamic = "force-dynamic";

/**
 * GET /api/me — local single-user profile pre-auth.
 * Same response shape docs/05 specifies so auth swaps in cleanly.
 */
export async function GET() {
  const state = await loadState();
  const { portfolio } = state;

  const filledBuys = state.trades.filter((t) => t.side === "buy");
  const closedTrades = state.trades.filter(
    (t) => t.side === "sell" && t.realizedPnl !== undefined,
  );
  const wins = closedTrades.filter((t) => (t.realizedPnl ?? 0) > 0).length;

  return apiOk({
    profile: {
      username: "ellio",
      isPublic: false,
    },
    portfolio,
    stats: {
      totalTrades: state.trades.length,
      winRate:
        closedTrades.length > 0
          ? Math.round((wins / closedTrades.length) * 100)
          : null,
      realizedPnl: portfolio.realizedPnl,
      openPositions: state.positions.filter((p) => p.status === "open").length,
    },
  });
}
