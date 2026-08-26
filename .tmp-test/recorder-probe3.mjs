const base = "http://localhost:3400/api/market";
const ids = "solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
for (let i = 0; i < 4; i++) {
  await fetch(`${base}/price?ids=${ids}`);
  await new Promise(r => setTimeout(r, 3500));
}
await new Promise(r => setTimeout(r, 62000)); // let a 1m bucket close
await fetch(`${base}/price?ids=${ids}`);
const c = await fetch(`${base}/candles?chain=solana&address=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&tf=1m&limit=200`);
const cj = await c.json();
console.log("source:", cj.data.source, "| n:", cj.data.candles.length, "| pts:", cj.data.coveragePoints ?? "-");
if (cj.data.candles.length) console.log("last:", cj.data.candles.at(-1));
