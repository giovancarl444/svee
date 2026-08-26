# SVEE TERMINAL — API Routes

All routes under `src/app/api/`. Auth = Supabase session cookie (auto via `@supabase/ssr`). All money values are strings (JSON-safe numerics). Every route returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

## Trading engine

### `POST /api/orders` — place order
```jsonc
// Request
{
  "idempotencyKey": "uuid-v4",          // required, retry-safe
  "side": "buy",                        // buy | sell
  "orderType": "market",                // market | limit | stop_loss | take_profit
  "chain": "solana",
  "tokenAddress": "EPjFW...",
  "tokenSymbol": "JUP",
  // BUY:
  "quoteAmount": "500.00",              // USDC to spend
  // SELL (one of):
  "qty": "1234.5",                      // exact tokens
  "sellPct": 25,                        // % of open position
  // Conditional orders:
  "limitPrice": "0.8020",
  "stopPrice": "0.7450",
  "expiresAt": "2026-08-27T12:00:00Z",  // optional TTL, default 7d for resting orders
  "exitPlan": [ {"pct":25,"tpBps":3000}, {"pct":25,"tpBps":6000} ]  // BUY only, optional
}
// Response 200
{ "ok": true, "data": {
    "order": { "id":"…","status":"filled"|"pending","latencyMs":318,
               "avgFillPrice":"0.8012","slippageBps":"42.10",
               "feeTotal":"1.52","feeBreakdown":{"platform":"0.90","network":"0.62"},
               "referencePrice":"0.8008" },
    "position": { … },                  // post-trade state
    "portfolio": { "cashUsdc":"9498.48", … },
    "achievementsUnlocked": [] }
}
// Errors: INSUFFICIENT_BALANCE · NO_POSITION · INVALID_PARAMS · RATE_LIMITED · MARKET_DATA_DOWN
```

### `GET /api/orders?status=open&limit=50`
Open/working orders for current user.
### `GET /api/orders/:orderId` — status polling (client polls ~1s while pending)
### `DELETE /api/orders/:orderId` — cancel resting order (returns freed quote if BUY)

### `POST /api/orders/exit-plan` — attach multi-exit ladder to an existing position
Request: `{ "positionId":"…", "levels":[{"pct":25,"tpBps":3000}] }` → creates `reduce_only` child orders.

### `POST /api/positions/:positionId/close` — flatten at market (sellPct=100)

## Portfolio & history

### `GET /api/me`
`{ profile, portfolio, stats: { totalValue, realizedPnl, unrealizedPnl, roiPct, winRate, totalTrades } }`

### `POST /api/portfolio/reset`
Resets cash to $10k, closes all positions at mark (realized PnL wiped), increments `reset_count`. Requires `confirm: true`.

### `GET /api/portfolio/history?range=7d|30d|all`
Equity curve points `[{ t, value }]` from trades + price marks.

### `GET /api/trades?limit=100&before=<cursor>`
Paginated fill ledger for current user.

### `GET /api/positions`
`{ open: Position[], closed: Position[] }` — includes live mark price + uPnL per position.

## Market data (proxied, cached)

| Route | Purpose | Cache |
|---|---|---|
| `GET /api/market/search?q=` | Token search (symbol/address prefix) | 60s |
| `GET /api/market/discover?tab=trending\|new\|gainers\|losers&chain=solana` | Discover tables | 30s |
| `GET /api/market/pulse` | Volume-spike/momentum feed | 20s |
| `GET /api/market/token/[chain]/[address]` | Full token overview: stats + holders + safety | 15s |
| `GET /api/market/candles?[chain]&[address]&tf=1m..1d&limit=500` | OHLCV for chart | 10s |
| `GET /api/market/price?ids=solana:addr,solana:addr` | Batch quotes — the polling heartbeat (client hits every 3–5s) | 3s |

All market routes are read-only public-cache-friendly (`s-maxage` headers) except none require auth beyond a valid session.

## Social

### `GET /api/leaderboard?period=daily|weekly|monthly|all_time&limit=100`
From `leaderboard_snapshots`. Includes current user's rank even when outside top N.

### `GET /api/u/[username]`
Public profile: `{ profile, stats, positions (open, if public), recentTrades, achievements }`. 404 unless `is_public`.

## Watchlists

| Route | Shape |
|---|---|
| `GET /api/watchlist` | Lists with items |
| `POST /api/watchlist/items` | `{ chain, tokenAddress, tokenSymbol }` |
| `DELETE /api/watchlist/items/:itemId` | Remove |

## Gamification

### `GET /api/achievements`
`{ unlocked: [...], available: [...catalog with progress] }`

## Engine internals (cron-only)

### `POST /api/engine/tick`
Guarded by `CRON_SECRET` header (Vercel Cron calls it every minute). Does:
1. Match resting orders against fresh prices (limit/stop/TP).
2. Expire stale orders past `expires_at`.
3. Recompute leaderboard snapshots on cadence (daily 00:05 UTC; weekly Mon; monthly 1st; all-time hourly).
4. Prune `price_cache` rows older than 24h.

Returns `{ matched: n, expired: n, leaderboardRebuilt: bool }`.

## Cross-cutting rules

- **Auth**: every route except `/u/[username]`, `/leaderboard`, and marketing pages requires a session; helpers in `lib/api/auth.ts` return 401 uniformly.
- **Rate limiting**: Upstash Redis sliding window — orders 30/min/user, market reads 120/min/IP. 429 with `Retry-After`.
- **Validation**: Zod schemas shared between client forms and route handlers (`lib/validation/orders.ts`) — one definition, no drift.
- **No secrets client-side**: Birdeye keys live only in server route handlers; the browser only ever talks to our API.
