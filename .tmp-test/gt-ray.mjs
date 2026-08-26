const BASE = "https://api.geckoterminal.com/api/v2";
const H = { accept: "application/json" };
const RAY = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
const pr = await fetch(`${BASE}/networks/solana/tokens/${RAY}/pools?page=1&sort=h24_volume_usd_liquidity_desc`, { headers: H });
const pd = await pr.json();
const ids = (pd.data ?? []).map(p => p.id);
console.log("ray pools:", ids.length, ids.slice(0,2).join(" "));
for (const [bucket, agg] of [["minute","15"],["hour","1"],["day","1"]]) {
  const res = await fetch(`${BASE}/networks/solana/pools/${ids[0]}/ohlcv/${bucket}?aggregate=${agg}&limit=300&currency=usd`, { headers: H });
  let n=-1;
  if (res.ok) { const j = await res.json(); n=(j.data?.[0]?.attributes?.ohlcv_list ?? []).length; }
  console.log(bucket, "status:", res.status, "candles:", n);
  await new Promise(r=>setTimeout(r,2500));
}
