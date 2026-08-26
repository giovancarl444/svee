/**
 * GeckoTerminal adapter — OHLCV candles + trending pools fallback.
 * Free tier: 30 calls/min. Docs: https://www.geckoterminal.com/dex-api
 */

import type { Chain } from "@/types/trading";
import { cacheGet, cacheSet } from "@/lib/market-data/cache";

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

/** UI timeframe → GT [bucket, aggregate] (GT paths: minute|hour|day only) */
const TF_MAP: Record<string, { bucket: string; aggregate: number }> = {
  "1m": { bucket: "minute", aggregate: 1 },
  "5m": { bucket: "minute", aggregate: 5 },
  "15m": { bucket: "minute", aggregate: 15 },
  "1h": { bucket: "hour", aggregate: 1 },
  "4h": { bucket: "hour", aggregate: 4 },
  "1d": { bucket: "day", aggregate: 1 },
};

interface GTOhlcvResponse {
  data?: {
    attributes?: {
      ohlcv_list?: [number, string, string, string, string, string][];
    };
  }[];
}

/**
 * Fetch OHLCV for a token — walks its pools by liquidity rank until one
 * returns candles (some pools have no OHLCV coverage on GT).
 * GT path: /networks/{network}/tokens/{address}/pools then /networks/{network}/pools/{pool}/ohlcv/{bucket}
 */
export async function fetchCandles(
  chain: Chain,
  address: string,
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d",
  limit = 300,
): Promise<Candle[]> {
  const network = NETWORKS[chain];

  // 1) resolve candidate pools, most liquid first (cached — GT rate budget is tight)
  const poolKey = `gt-pools:${network}:${address.toLowerCase()}`;
  let pools = cacheGet<string[]>(poolKey);
  if (!pools) {
    const poolRes = await fetch(
      `${BASE}/networks/${network}/tokens/${address}/pools?page=1&sort=h24_volume_usd_liquidity_desc`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
    );
    if (!poolRes.ok) throw new Error(`geckoterminal pools ${poolRes.status}`);
    const poolData = (await poolRes.json()) as {
      data?: { id: string }[];
    };
    pools = (poolData.data ?? []).map((p) => p.id);
    // Only cache non-empty resolutions; empty may be a silent 429 body.
    if (pools.length > 0) cacheSet(poolKey, pools, 30 * 60_000);
  }
  if (pools.length === 0) return [];

  const tf = TF_MAP[timeframe] ?? TF_MAP["15m"];

  // 2) try pools until one yields candles
  let lastErr: unknown = null;
  for (const poolId of pools.slice(0, 4)) {
    const url =
      `${BASE}/networks/${network}/pools/${poolId}/ohlcv/${tf.bucket}` +
      `?aggregate=${tf.aggregate}&limit=${Math.min(limit, 1000)}&currency=usd`;
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue; // 404/429 → next pool
      const json = (await res.json()) as GTOhlcvResponse;
      const list = json.data?.[0]?.attributes?.ohlcv_list ?? [];
      const candles = list
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
      if (candles.length > 0) return candles;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
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
