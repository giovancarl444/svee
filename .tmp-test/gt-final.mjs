const BASE = "https://api.geckoterminal.com/api/v2";
const H = { accept: "application/json" };
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const WSOL = "So11111111111111111111111111111111111111112";

// A) does BONK have legacy (V4) pools?
let r = await fetch(`${BASE}/networks/solana/tokens/${BONK}/pools?page=1&sort=h24_volume_usd_liquidity_desc&dex=raydium`, { headers: H });
if (r.ok) {
  const j = await r.json();
  console.log("BONK legacy pools:", (j.data ?? []).length);
} else console.log("BONK legacy status:", r.status);
await new Promise(r=>setTimeout(r,3000));

// B) SOL legacy pools → ohlcv
r = await fetch(`${BASE}/networks/solana/tokens/${WSOL}/pools?page=1&sort=h24_volume_usd_liquidity_desc&dex=raydium`, { headers: H });
const j = await r.json();
const first = (j.data ?? [])[0];
console.log("SOL legacy top:", first?.id, "|", first?.attributes?.name);
await new Promise(r=>setTimeout(r,3000));
r = await fetch(`${BASE}/networks/solana/pools/${first.id}/ohlcv/hour?aggregate=1&limit=300&currency=usd`, { headers: H });
let n=-1;
if (r.ok) { const jj = await r.json(); n=(jj.data?.[0]?.attributes?.ohlcv_list ?? []).length; }
console.log("SOL hour candles:", n, "status:", r.status);
