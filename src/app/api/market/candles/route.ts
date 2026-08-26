import { fetchCandles, type Candle } from "@/lib/market-data/geckoterminal";
import { cacheGet, cacheSet } from "@/lib/market-data/cache";
import {
  resampleHistory,
  historyLength,
} from "@/lib/market-data/history";
import { apiOk, apiErr } from "@/lib/api/respond";
import type { Chain } from "@/types/trading";

export const dynamic = "force-dynamic";

const CHAINS: Chain[] = ["solana", "ethereum", "base", "bnb"];
const TFS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Tf = (typeof TFS)[number];

/**
 * GET /api/market/candles?chain=solana&address=…&tf=15m&limit=300
 * Source chain: GeckoTerminal OHLCV → locally-recorded quote history.
 * Empty results are never cached (a rate-limited blip must not poison TTL).
 */
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

  const key = `candles:${chain}:${address.toLowerCase()}:${tf}:${limit}`;
  const hit = cacheGet<Candle[]>(key);
  if (hit && hit.length > 0) {
    return apiOk({ candles: hit, timeframe: tf, source: "geckoterminal" });
  }

  // 1) upstream OHLCV
  try {
    const candles = await fetchCandles(chain, address, tf, limit);
    if (candles.length > 0) {
      cacheSet(key, candles, 60_000);
      return apiOk({ candles, timeframe: tf, source: "geckoterminal" });
    }
  } catch (e) {
    console.error("[api/market/candles] gt failed:", e instanceof Error ? e.message : e);
  }

  // 2) locally-recorded live-quote history (accumulates while you watch)
  const tokenKey = `${chain}:${address.toLowerCase()}`;
  const local = resampleHistory(tokenKey, tf);
  if (local.length > 0) {
    return apiOk({
      candles: local.slice(-limit),
      timeframe: tf,
      source: "live-history",
      coveragePoints: historyLength(tokenKey),
    });
  }

  return apiOk({
    candles: [],
    timeframe: tf,
    source: "none",
    hint: "chart warming up — candles appear after ~2 min of live watching",
  });
}
