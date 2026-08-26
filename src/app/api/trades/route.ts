import { apiOk } from "@/lib/api/respond";
import { loadState } from "@/lib/store/paper";

export const dynamic = "force-dynamic";

/** GET /api/trades?limit=100 — fill ledger, newest first. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 100);
  const limit = Math.min(500, Math.max(1, Math.floor(limitRaw) || 100));
  const state = await loadState();
  return apiOk({ trades: state.trades.slice(0, limit) });
}
