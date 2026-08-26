/**
 * GeckoTerminal adapter — OHLCV candles + trending pools fallback.
 * Free tier: 30 calls/min. Docs: https://www.geckoterminal.com/dex-api
 */

import type { Chain } from "@/types/trading";

const BASE = "https://api.geckoterminal.com/api/v2";
const NETWORKS: Record<Chain, string> = {
  solana: "solana",
  ethereum: "eth",
  base: "base",
  bnb: "bsc",
};

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** GT timeframe buckets we expose (map from UI timeframes) */
const TF_MAP: Record<string, { aggregate: string; limit: number }> = {
  "1m": { aggregate: "minute", limit: 500 },
  "5m": { aggregate: "minute", limit: 500 }, // aggregated via period below
};

interface GTOhlcvResponse {
  data?: {
    attributes?: {
      ohlcv_list?: [number, string, string, string, string, string][];
    };
  }[];
}

/**
 * Fetch OHLCV for a token's most liquid pool.
 * GT path: /networks/{network}/tokens/{address}/pools then /networks/{network}/pools/{pool}/ohlcv/{timeframe}
 */
export async function fetchCandles(
  chain: Chain,
  address: string,
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d",
  limit = 300,
): Promise<Candle[]> {
  const network = NETWORKS[chain];

  // 1) resolve the token's highest-liquidity pool
  const poolRes = await fetch(
    `${BASE}/networks/${network}/tokens/${address}/pools?page=1&sort=h24_volume_usd_liquidity_desc`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
  );
  if (!poolRes.ok) throw new Error(`geckoterminal pools ${poolRes.status}`);
  const poolData = (await poolRes.json()) as {
    data?: { id: string }[];
  };
  const poolId = poolData.data?.[0]?.id; // e.g. "solana:9WzD..."
  if (!poolId) return [];

  const gtTf = timeframe === "1d" ? "day" : timeframe === "4h" ? "4h" : timeframe === "1h" ? "hour" : `${timeframe}`;

  // 2) pull candles
  const url =
    `${BASE}/networks/${network}/pools/${poolId}/ohlcv/${gtTf}` +
    `?aggregate=${gtTf === "day" || gtTf === "4h" ? "1" : "1"}&limit=${Math.min(limit, 1000)}&currency=usd`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`geckoterminal ohlcv ${res.status}`);
  const json = (await res.json()) as GTOhlcvResponse;

  const list =
    json.data?.[0]?.attributes?.ohlcv_list ?? [];
  // rows: [ts, o, h, l, c, v] — GT returns newest-first
  return list
    .map<Candle>((row) => ({
      time: row[0],
      open: parseFloat(row[1]),
      high: parseFloat(row[2]),
      low: parseFloat(row[3]),
      close: parseFloat(row[4]),
      volume: parseFloat(row[5]),
    }))
    .filter((c) => Number.isFinite(c.close) && c.close > 0)
    .sort((a, b) => a.time - b.time);
}

export async function fetchTrendingPools(chain: Chain): Promise<
  { address: string; symbol: string; name: string; priceUsd: number; volume24h: number }[]
> {
  const res = await fetch(
    `${BASE}/networks/${NETWORKS[chain]}/trending_pools?include=base_token,dex`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
  );
  if (!res.ok) throw new Error(`geckoterminal trending ${res.status}`);
  const json = (await res.json()) as {
    data?: {
      attributes?: {
        address?: string;
        name?: string;
        base_token_price_usd?: string;
        volume_usd?: { h24?: string };
      };
    }[];
  };
  return (json.data ?? [])
    .map((p) => {
      const attrs = p.attributes ?? {};
      // name is like "SOL / USDC"
      const [symbol] = (attrs.name ?? "?").split(" / ");
      return {
        address: attrs.address ?? "",
        symbol,
        name: attrs.name ?? "",
        priceUsd: parseFloat(attrs.base_token_price_usd ?? "0"),
        volume24h: parseFloat(attrs.volume_usd?.h24 ?? "0"),
      };
    })
    .filter((p) => p.address);
}
