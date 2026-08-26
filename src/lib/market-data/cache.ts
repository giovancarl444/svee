/**
 * Minimal in-memory TTL cache. Server-side singleton per route process.
 * Deliberately Redis-swappable: same interface (docs/01 — cache.ts note).
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  // Bound memory: drop expired entries when the map grows large
  if (store.size > 5_000) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now > v.expiresAt) store.delete(k);
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Get-or-fetch wrapper with in-flight dedup (thundering herd guard). */
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = fetcher()
    .then((value) => {
      cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}
