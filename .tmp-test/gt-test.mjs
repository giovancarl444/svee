const url = "https://api.geckoterminal.com/api/v2/networks/solana/pools/58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2/ohlcv/hour?aggregate=1&limit=3";
for (const label of ["no-ua", "with-ua"]) {
  const headers = { accept: "application/json" };
  if (label === "with-ua") headers["user-agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    const txt = await res.text();
    console.log(label, "status:", res.status, "len:", txt.length, "head:", txt.slice(0, 120).replace(/\n/g, ""));
  } catch (e) { console.log(label, "ERR:", e.message); }
  await new Promise(r => setTimeout(r, 3000));
}
