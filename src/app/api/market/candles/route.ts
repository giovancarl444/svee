import { fetchCandles } from "@/lib/market-data/geckoterminal";
import { cached } from "@/lib/market-data/cache";
import { apiOk, apiErr } from "@/lib/api/respond";
import type { Chain } from "@/types/trading";

export const dynamic = "force-dynamic";

const CHAINS: Chain[] = ["solana", "ethereum", "base", "bnb"];
const TFS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Tf = (typeof TFS)[number];

/** GET /api/market/candles?chain=solana&address=…&tf=15m&limit=300 — 60s cache */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const chain = url.searchParams.get("chain") as Chain | null;
  const address = url.searchParams.get("address");
  const tfParam = url.searchParams.get("tf") ?? "15m";
  const limitRaw = Number(url.searchParams.get("limit") ?? 300);
  const limit = Math.min(1000, Math.max(50, Math.floor(limitRaw) || 300));

  if (!chain || !address || !CHAINS.includes(chain)) {
    return apiErr(400, "INVALID_PARAMS", "chain + address required");
  }
  if (!(TFS as readonly string[]).includes(tfParam)) {
    return apiErr(400, "INVALID_PARAMS", `tf must be one of ${TFS.join("|")}`);
  }
  const tf = tfParam as Tf;

  try {
    const candles = await cached(
      `candles:${chain}:${address.toLowerCase()}:${tf}:${limit}`,
      60_000,
      () => fetchCandles(chain, address, tf, limit),
    );
    return apiOk({ candles, timeframe: tf });
  } catch (e) {
    console.error("[api/market/candles]", e);
    return apiErr(502, "MARKET_DATA_DOWN", "provider unreachable");
  }
}
