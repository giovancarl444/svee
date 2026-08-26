const BASE = "https://api.geckoterminal.com/api/v2";
const H = { accept: "application/json" };
const RAY = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
const pr = await fetch(`${BASE}/networks/solana/tokens/${RAY}/pools?page=1&sort=h24_volume_usd_liquidity_desc`, { headers: H });
const pd = await pr.json();
(pd.data ?? []).forEach((p, i) => {
  const a = p.attributes ?? {};
  console.log(i, p.id.replace("solana_", "").slice(0, 8), "|", a.name, "| liq:", Math.round((a.reserve_in_usd ?? 0)/1e6)+"M");
});
