import { fetchQuotes } from "@/lib/market-data/dexscreener";
import { cached } from "@/lib/market-data/cache";
import { recordPrice } from "@/lib/market-data/history";
import { apiOk, apiErr } from "@/lib/api/respond";
import type { Chain } from "@/types/trading";

export const dynamic = "force-dynamic";

const CHAINS: Chain[] = ["solana", "ethereum", "base", "bnb"];

/**
 * GET /api/market/price?ids=solana:addr,solana:addr2
 * Batch quotes — the polling heartbeat (client hits every 3–5s). 3s microcache.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("ids") ?? "";
  const keys: { chain: Chain; address: string }[] = [];
  for (const part of raw.split(",")) {
    const [chain, addr] = part.split(":");
    if (!chain || !addr) continue;
    if (!CHAINS.includes(chain as Chain)) continue;
    keys.push({ chain: chain as Chain, address: addr });
  }
  if (keys.length === 0) {
    return apiErr(400, "INVALID_PARAMS", "ids must be chain:address,…");
  }

  const cacheKey = `price:${keys
    .map((k) => `${k.chain}:${k.address.toLowerCase()}`)
    .sort()
    .join(",")}`;

  try {
    const quotes = await cached(cacheKey, 3_000, () => fetchQuotes(keys));
    // Feed the live-history recorder (backs the chart when OHLCV is down)
    for (const q of quotes.values()) recordPrice(q.key, q.priceUsd);
    return apiOk({
      quotes: [...quotes.values()],
      asOf: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[api/market/price]", e);
    return apiErr(502, "MARKET_DATA_DOWN", "provider unreachable");
  }
}
