const BASE = "https://api.geckoterminal.com/api/v2";
const H = { accept: "application/json" };
const WSOL = "So11111111111111111111111111111111111111112";
const r = await fetch(`${BASE}/networks/solana/tokens/${WSOL}/pools?page=1&sort=h24_volume_usd_liquidity_desc`, { headers: H });
const j = await r.json();
const pools = (j.data ?? []).slice(0, 6);
console.log("top pools:");
for (const p of pools) console.log(" ", p.id.replace("solana_","").slice(0,10), "|", p.attributes?.name, "| liq:", Math.round((p.attributes?.reserve_in_usd ?? 0)/1e6)+"M");
for (const p of pools.slice(0, 3)) {
  const res = await fetch(`${BASE}/networks/solana/pools/${p.id}/ohlcv/hour?aggregate=1&limit=300&currency=usd`, { headers: H });
  let n=-1;
  if (res.ok) { const jj = await res.json(); n=(jj.data?.[0]?.attributes?.ohlcv_list ?? []).length; }
  console.log(p.id.replace("solana_","").slice(0,10), "hour:", res.status, "n:", n);
  await new Promise(r=>setTimeout(r,2500));
}
