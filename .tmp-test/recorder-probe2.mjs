const base = "http://localhost:3400/api/market";
const ids = "solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
// one more tick to keep buffer warm, then check 1m candles
await fetch(`${base}/price?ids=${ids}`);
const c = await fetch(`${base}/candles?chain=solana&address=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&tf=1m&limit=200`);
const cj = await c.json();
console.log("source:", cj.data.source, "| n:", cj.data.candles.length, "| pts:", cj.data.coveragePoints ?? "-");
if (cj.data.candles.length) {
  for (const k of cj.data.candles.slice(-3)) console.log(k);
}
