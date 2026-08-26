const base = "http://localhost:3400/api/market";
const ids = "solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
// warm: 4 ticks over ~14s
for (let i = 0; i < 4; i++) {
  await fetch(`${base}/price?ids=${ids}`);
  await new Promise(r => setTimeout(r, 3500));
}
// wait for the current 1m bucket to close
await new Promise(r => setTimeout(r, 65000));
await fetch(`${base}/price?ids=${ids}`);
const c = await fetch(`${base}/candles?chain=solana&address=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&tf=1m&limit=200`);
const cj = await c.json();
console.log("source:", cj.data.source, "| n:", cj.data.candles.length);
for (const k of cj.data.candles.slice(-2)) console.log(k);
