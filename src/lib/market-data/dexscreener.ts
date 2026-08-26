/**
 * DexScreener adapter — primary price/pair source (free, ~300 req/min).
 * Docs: https://docs.dexscreener.com/api/reference
 */

import type { Chain } from "@/types/trading";

const BASE = "https://api.dexscreener.com/latest/dex";
const CHAIN_IDS: Record<Chain, string> = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  bnb: "bnb",
};

/** Normalized quote used across the app */
export interface TokenQuote {
  key: string; // "solana:<addr>"
  chain: Chain;
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  changeM5: number;
  changeH1: number;
  changeH24: number;
  volume24h: number;
  liquidityUsd: number;
  marketCap: number;
  fdv?: number;
  pairAddress?: string;
  pairCreatedAtMs?: number;
}

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { m5?: number; h1?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
}

function chainFromId(id: string): Chain | null {
  const entry = (Object.entries(CHAIN_IDS) as [Chain, string][]).find(
    ([, v]) => v === id,
  );
  return entry ? entry[0] : null;
}

function pairToQuote(p: DexPair): TokenQuote | null {
  const chain = chainFromId(p.chainId);
  if (!chain || !p.priceUsd) return null;
  return {
    key: `${chain}:${p.baseToken.address}`,
    chain,
    address: p.baseToken.address,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    priceUsd: parseFloat(p.priceUsd),
    changeM5: p.priceChange?.m5 ?? 0,
    changeH1: p.priceChange?.h1 ?? 0,
    changeH24: p.priceChange?.h24 ?? 0,
    volume24h: p.volume?.h24 ?? 0,
    liquidityUsd: p.liquidity?.usd ?? 0,
    marketCap: p.marketCap ?? p.fdv ?? 0,
    fdv: p.fdv,
    pairAddress: p.pairAddress,
    pairCreatedAtMs: p.pairCreatedAt,
  };
}

/** Pick the most liquid pair when multiple DEXs list the same token. */
function bestPair(pairs: DexPair[], chain: string): DexPair | undefined {
  return pairs
    .filter((p) => p.chainId === chain)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

async function dsFetch(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`dexscreener ${res.status}`);
  return res.json();
}

/** Batch quotes for up to 30 addresses (single upstream call). */
export async function fetchQuotes(
  keys: { chain: Chain; address: string }[],
): Promise<Map<string, TokenQuote>> {
  const out = new Map<string, TokenQuote>();
  if (keys.length === 0) return out;

  // Group by chain, chunk into batches of 30 addresses
  const byChain = new Map<Chain, string[]>();
  for (const k of keys) {
    const list = byChain.get(k.chain) ?? [];
    if (!list.includes(k.address)) list.push(k.address);
    byChain.set(k.chain, list);
  }

  await Promise.all(
    [...byChain.entries()].flatMap(([chain, addrs]) =>
      chunk(addrs, 30).map(async (batch) => {
        const data = (await dsFetch(`/tokens/${batch.join(",")}`)) as {
          pairs: DexPair[] | null;
        };
        for (const addr of batch) {
          const pair = bestPair(data.pairs ?? [], CHAIN_IDS[chain]);
          if (!pair || pair.baseToken.address.toLowerCase() !== addr.toLowerCase())
            continue;
          const q = pairToQuote(pair);
          if (q && q.priceUsd > 0) out.set(q.key, q);
        }
      }),
    ),
  );
  return out;
}

/** Search by symbol/name/address — powers ⌘K and Discover search box. */
export async function fetchSearch(q: string): Promise<TokenQuote[]> {
  const data = (await dsFetch(`/search?q=${encodeURIComponent(q)}`)) as {
    pairs: DexPair[] | null;
  };
  return (data.pairs ?? [])
    .slice(0, 100)
    .map(pairToQuote)
    .filter((x): x is TokenQuote => x !== null)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
    .slice(0, 40);
}

export async function fetchTokenQuote(
  chain: Chain,
  address: string,
): Promise<TokenQuote | null> {
  const map = await fetchQuotes([{ chain, address }]);
  return map.get(`${chain}:${address}`) ?? null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
