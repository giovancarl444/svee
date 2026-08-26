import { fetchSearch } from "@/lib/market-data/dexscreener";
import { cached } from "@/lib/market-data/cache";
import { apiOk, apiErr } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return apiErr(400, "INVALID_PARAMS", "q must be at least 2 characters");
  }
  try {
    const results = await cached(`search:${q.toLowerCase()}`, 60_000, () =>
      fetchSearch(q),
    );
    return apiOk({ results });
  } catch (e) {
    console.error("[api/market/search]", e);
    return apiErr(502, "MARKET_DATA_DOWN", "provider unreachable");
  }
}
