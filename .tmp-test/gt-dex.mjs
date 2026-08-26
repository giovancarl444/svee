const BASE = "https://api.geckoterminal.com/api/v2";
const H = { accept: "application/json" };
const WSOL = "So11111111111111111111111111111111111111112";
// 1) does a dex filter exist for legacy raydium?
const res = await fetch(`${BASE}/networks/solana/tokens/${WSOL}/pools?page=1&sort=h24_volume_usd_liquidity_desc&dex=raydium`, { headers: H });
console.log("filtered status:", res.status);
if (res.ok) {
  const j = await res.json();
  const ids = (j.data ?? []).map(p => p.id);
  console.log("legacy raydium pools:", ids.length);
  console.log(ids.slice(0,3).join(" "));
}
