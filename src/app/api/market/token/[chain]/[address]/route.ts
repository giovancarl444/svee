import { fetchTokenQuote } from "@/lib/market-data/dexscreener";
import { cached } from "@/lib/market-data/cache";
import { apiOk, apiErr } from "@/lib/api/respond";
import type { Chain } from "@/types/trading";

export const dynamic = "force-dynamic";

const CHAINS: Chain[] = ["solana", "ethereum", "base", "bnb"];

/** GET /api/market/token/[chain]/[address] — full token overview. 15s cache. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chain: string; address: string }> },
) {
  const { chain: chainRaw, address } = await params; // Next 15+/16: params is async
  const chain = chainRaw as Chain;
  if (!CHAINS.includes(chain)) {
    return apiErr(400, "INVALID_PARAMS", `unknown chain ${chainRaw}`);
  }

  try {
    const quote = await cached(
      `token:${chain}:${address.toLowerCase()}`,
      15_000,
      () => fetchTokenQuote(chain, address),
    );
    if (!quote) {
      return apiErr(404, "NOT_FOUND", "token not found on any DEX pair");
    }
    return apiOk({ token: quote });
  } catch (e) {
    console.error("[api/market/token]", e);
    return apiErr(502, "MARKET_DATA_DOWN", "provider unreachable");
  }
}
