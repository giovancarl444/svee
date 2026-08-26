// exact same sequence the app route runs: pools resolve → ohlcv walk
const BASE = "https://api.geckoterminal.com/api/v2";
const addr = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const H = { accept: "application/json" };
const pr = await fetch(`${BASE}/networks/solana/tokens/${addr}/pools?page=1&sort=h24_volume_usd_liquidity_desc`, { headers: H, signal: AbortSignal.timeout(8000) });
console.log("pools status:", pr.status);
const pd = await pr.json();
const ids = (pd.data ?? []).map(p => p.id).slice(0, 4);
console.log("pools:", ids.length, ids.join(" "));
for (const id of ids) {
  const res = await fetch(`${BASE}/networks/solana/pools/${id}/ohlcv/minute?aggregate=15&limit=200&currency=usd`, { headers: H, signal: AbortSignal.timeout(8000) });
  let n = -1;
  if (res.ok) {
    const j = await res.json();
    n = (j.data?.[0]?.attributes?.ohlcv_list ?? []).length;
  }
  console.log(id.slice(7, 15), "status:", res.status, "candles:", n);
  await new Promise(r => setTimeout(r, 2500));
}
