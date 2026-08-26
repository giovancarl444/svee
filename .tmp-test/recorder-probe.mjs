// hit price 3x spaced 4s, then check candles
const base = "http://localhost:3400/api/market";
const ids = "solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
for (let i = 0; i < 3; i++) {
  const r = await fetch(`${base}/price?ids=${ids}`);
  const j = await r.json();
  console.log("tick", i, j.data?.quotes?.[0]?.priceUsd);
  await new Promise(r => setTimeout(r, 4000));
}
const c = await fetch(`${base}/candles?chain=solana&address=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&tf=1m&limit=200`);
const cj = await c.json();
console.log("candles:", cj.data.source, cj.data.candles.length);
