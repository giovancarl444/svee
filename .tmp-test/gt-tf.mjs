const BASE = "https://api.geckoterminal.com/api/v2";
const H = { accept: "application/json" };
const tests = [
  ["bonk/5zpy", "solana_5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9", "hour"],
  ["ray-sol", "solana_58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2", "minute"],
];
for (const [label, id, bucket] of tests) {
  const agg = bucket === "minute" ? "15" : "1";
  const res = await fetch(`${BASE}/networks/solana/pools/${id}/ohlcv/${bucket}?aggregate=${agg}&limit=5&currency=usd`, { headers: H, signal: AbortSignal.timeout(8000) });
  let n = -1;
  if (res.ok) { const j = await res.json(); n = (j.data?.[0]?.attributes?.ohlcv_list ?? []).length; }
  console.log(label, bucket, "status:", res.status, "candles:", n);
  await new Promise(r => setTimeout(r, 2500));
}
// also check the dex/type attribute of bonk vs ray pool
for (const [label, id] of [["bonk", "solana_5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9"], ["raysol", "solana_58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"]]) {
  const res = await fetch(`${BASE}/networks/solana/pools/${id}?include=dex`, { headers: H, signal: AbortSignal.timeout(8000) });
  if (res.ok) {
    const j = await res.json();
    const attrs = j.data?.attributes ?? {};
    const dexRel = (j.included ?? []).find(x => x.type === "dex");
    console.log(label, "dex:", dexRel?.attributes?.name ?? j.data?.relationships?.dex?.data?.id);
  } else console.log(label, "pool-detail status:", res.status);
  await new Promise(r => setTimeout(r, 2500));
}
