/**
 * Live price-history recorder — ring buffers of { t, p } per token key.
 * Fed by /api/market/price on every heartbeat poll; resampled into real
 * candles by /api/market/candles when upstream OHLCV providers fail.
 * In-memory per server process: dev-server restarts just refill in seconds.
 */

const MAX_POINTS_PER_TOKEN = 7_200; // 8h at 4s cadence

// Anchor on globalThis: Next dev/Turbopack gives each API route its own
// module instance, so plain module-level Maps are NOT shared across routes.
type Tick = { t: number; p: number };
const g = globalThis as typeof globalThis & {
  __sveePriceHistory?: Map<string, Tick[]>;
};
const buffers = g.__sveePriceHistory ?? new Map<string, Tick[]>();
g.__sveePriceHistory = buffers;

export function recordPrice(key: string, priceUsd: number): void {
  if (!(priceUsd > 0)) return;
  const normKey = key.toLowerCase(); // readers always query lowercased keys
  const now = Date.now();
  let buf = buffers.get(normKey);
  if (!buf) {
    buf = [];
    buffers.set(normKey, buf);
  }
  const last = buf[buf.length - 1];
  if (!last || now - last.t >= 3_000) {
    buf.push({ t: now, p: priceUsd });
    if (buf.length > MAX_POINTS_PER_TOKEN) buf.splice(0, buf.length - MAX_POINTS_PER_TOKEN);
  }
}

export function historyLength(key: string): number {
  return buffers.get(key)?.length ?? 0;
}

export interface ResampledCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // unknown from quotes → 0
}

/** Bucket size in ms per UI timeframe */
const TF_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/**
 * Resample raw ticks into OHLC buckets. The currently-forming bucket is
 * excluded; every fully-closed bucket observed so far is returned.
 */
export function resampleHistory(
  key: string,
  timeframe: string,
): ResampledCandle[] {
  const buf = buffers.get(key);
  const size = TF_MS[timeframe];
  if (!buf || !size || buf.length < 5) return [];

  const now = Date.now();
  const lastFullClose = Math.floor(now / size) * size - size; // exclude open bucket

  type Acc = { o: number; h: number; l: number; c: number };
  const buckets = new Map<number, Acc>();
  for (const { t, p } of buf) {
    if (t >= lastFullClose + size) continue; // skip current open bucket
    const bStart = Math.floor(t / size) * size;
    if (bStart > lastFullClose) continue;
    const acc = buckets.get(bStart);
    if (!acc) buckets.set(bStart, { o: p, h: p, l: p, c: p });
    else {
      acc.h = Math.max(acc.h, p);
      acc.l = Math.min(acc.l, p);
      acc.c = p;
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bStart, acc]) => ({
      time: Math.floor(bStart / 1000),
      open: acc.o,
      high: acc.h,
      low: acc.l,
      close: acc.c,
      volume: 0,
    }));
}
