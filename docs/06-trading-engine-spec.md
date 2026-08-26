# SVEE TERMINAL — Trading Engine Specification

The heart of realism. Everything in `src/lib/engine/` is pure TypeScript, deterministic given the same inputs + RNG seed, and unit-testable. No React, no Next imports.

## Guiding principle

> A trader should be able to lose paper money for the same reasons they'd lose real money: slippage on size, fees eating small wins, failed transactions, and getting front-run. If it feels too clean, it's wrong.

---

## 1. Order lifecycle

```
                 ┌──────────────────────────────────────────┐
                 │            CLIENT submits                │
                 └────────────┬─────────────────────────────┘
                              ▼
                    [ idempotency check ] ──duplicate──▶ return original result
                              ▼
                       status: SUBMITTED   (persisted)
                              ▼
                 simulate network latency 200–500ms
                              ▼
              ┌───── MARKET ORDER? ───── yes ──▶ EXECUTE PIPELINE ──▶ FILLED or FAILED
              │                                     (see §2)
              no (limit/stop/tp)
                              ▼
                       status: PENDING     (simulating mempool arrival)
                              ▼ after latency
                       status: OPEN        (resting in matcher)
                              ▼
        ENGINE TICK (every ≤60s, cron): compare trigger vs real price feed
              ├─ condition met ──▶ EXECUTE PIPELINE ──▶ FILLED / FAILED
              ├─ expires_at passed ──▶ EXPIRED (frees reserved funds)
              └─ user cancels ─────▶ CANCELLED
```

Status meanings (mirrors real terminal UX): `submitted` (accepted, not yet simulated-broadcast) → `pending` (in simulated mempool) → `open` (resting) → `filled` / `cancelled` / `expired` / `failed`.

**BUY fund reservation**: placing a limit buy reserves `quote_amount` from `cash_usdc` immediately (moves to `orders` escrow semantics) so users can't double-commit. Cancel/expire refunds. Market buys debit atomically inside execution.

---

## 2. Execution pipeline (market fills)

Steps run in order; each can abort with `failed`:

1. **Fetch reference price** — best bid/ask midpoint from provider cache (`price_cache`), max age 15s. If stale/unavailable → try fallback provider → else FAIL with `MARKET_DATA_DOWN` (realistic: terminals fail during outages).
2. **Slippage simulation** — see §3.
3. **Fee stack** — see §4.
4. **Randomized failure roll** — see §6.
5. **Apply** — single DB transaction:
   - BUY: `cash -= (quote + fees)`; position qty += filledQty; avg entry recomputed (§7); create trade row.
   - SELL: qty -= soldQty; realized PnL computed (§7); `cash += proceeds - fees`; if qty→0 close position row (move to closed history).
   - Insert immutable `trades` row with fake `tx_hash`.
6. **Post-trade hooks** (async, non-blocking): achievement evaluation, portfolio stats recompute.

Latency is *felt*, not just recorded: the API holds the response for `sampled_latency_ms` before returning, so the UI's spinner duration matches reality.

---

## 3. Slippage model

Real AMM slippage grows with size relative to liquidity. We approximate a constant-product curve:

```
base_bps       = 8                                   # tight pools baseline
size_impact    = (trade_usd / liquidity_usd) ^ 0.5 × 2500 bps
volatility_adj = clamp(vol_24h < $100k ? ×1.5 : vol_24h > $10m ? ×0.8 : ×1.0)
direction      = buys pay up, sells receive down (always adverse)
random_noise   = uniform(0.9, 1.15)

slippage_bps   = (base_bps + size_impact) × volatility_adj × random_noise
exec_price     = ref_price × (1 ± slippage_bps/10⁴)   # adverse side only
```

Examples: $500 into $500k liquidity ≈ 40bps (~0.4%, matches constant-product 2ΔB/B). $2,000 into $40k liquidity ≈ 350bps+ once the low-volume multiplier applies — you get wrecked for size, exactly like real microcaps. Cap at 5000bps (50%); beyond that the order **fails as insufficient liquidity** rather than filling absurdly.

Config lives in `engine/constants.ts` — tunable without touching logic.

## 4. Fee schedule

| Fee | Value | When |
|---|---|---|
| Platform (simulated) | 0.90% of quote value | every fill (matches typical bot fee) |
| Network/gas (simulated) | flat 0.0004 SOL ≈ $0.06–$0.12 sampled log-normal | every fill |
| MEV/sandwich event | 2% of fills on new pairs (<24h) cost extra 1–5% adverse | randomized |

`fee_breakdown` JSON records each component — the FeePreview panel shows the same schedule BEFORE submission (expected values) and the order record shows actuals AFTER.

## 5. Limit / stop / TP matching (engine tick)

Every tick fetches one batched quote per distinct watched token (DexScreener batch endpoints, cached 3s):

| Type | Trigger condition (last price P) | Fill price |
|---|---|---|
| Limit BUY | P ≤ limit_price | limit_price (maker-style, no slippage penalty; noise ±2bps) |
| Limit SELL | P ≥ limit_price | limit_price (same) |
| Stop LOSS | P ≤ stop_price | market exec w/ slippage §3 (stops slip — that's the lesson) |
| Take PROFIT | P ≥ tp_price | market exec w/ slippage |

Anti-spike guard: require the trigger price observed on **two consecutive ticks** (or tick + fresh quote confirmation) before firing stops — prevents filling on a single bad candle wick, mirroring how traders set buffer. Configurable; default ON for stops.

Expiry default 7 days (`expires_at`), then EXPIRED + refund reservation.

## 6. Failure simulation

Rolls happen once per order at execution time:

- Base tx failure rate: **1.5%** ("Transaction failed — slippage exceeded") — auto-fail regardless of everything else.
- New pairs (<24h old): failure rate **6%**, plus MEV event chance above.
- Failed orders refund everything; UI shows red toast + order marked FAILED with reason. Traders learn to expect this — it's the #1 realism complaint about naive paper traders.

## 7. PnL computation (average-cost method)

```
On BUY:  new_avg_entry = (old_qty×old_avg + fill_qty×fill_price) / (old_qty+fill_qty)
         invested_usdc += fill_qty×fill_price + fees
On SELL: realized_pnl = (fill_price − avg_entry) × sold_qty − sell_fees
         invested_usdc −= avg_entry × sold_qty            # fees hit realized, not basis
Unrealized = (mark_price − avg_entry) × qty                # mark = live provider price
ROI%      = (unrealized + realized_position_pnl) / invested, per position
Portfolio equity = cash + Σ(qtyᵢ × markᵢ)
```

Fees reduce realized PnL but never distort average entry — matches exchange convention and keeps break-even math honest (`breakeven = avg_entry / (1 − fee_rate)` shown in UI).

## 8. Exit plans

A parent BUY may carry `exit_plan: [{pct, tpBps}]`. On FILL, the engine immediately spawns child `take_profit` orders (`reduce_only=true`, `parent_order_id=parent.id`, `sell_pct=pct`, trigger = avg_fill × (1+tpBps)). Children reserve nothing (they only sell). If the position flattens first (manual close), children auto-cancel. Ladder example: sell 25% at +30%, 25% at +60%, runner stays.

## 9. Data feeds & rate-limit discipline

- **Primary**: DexScreener (free, generous). Batch endpoints where possible; 3s server-side cache means N clients polling `/market/price` collapse into ≤1 upstream req/3s/token-set.
- **Fallback**: GeckoTerminal. **Enhanced**: Birdeye (holders, safety) behind its own adapter + longer cache (60s).
- Circuit breaker: 3 consecutive provider failures → serve stale-up-to-60s → then explicit degraded mode flag in responses (`data.stale: true`) which the UI surfaces honestly ("Prices delayed").
- The engine tick runs server-side (Vercel Cron → `/api/engine/tick` with secret header). Client never triggers matching.

## 10. Determinism & testing strategy

Pure functions take `(input, rngSeed)`. Unit tests cover: slippage monotonicity (bigger size ⇒ worse price), fee math rounding, avg-entry updates across mixed buys, realized PnL incl. fees, stop trigger edge cases, expiry refunds, idempotent duplicate submissions, failure-roll distribution sanity. Integration test: full buy → limit sell → TP ladder lifecycle against a mocked price feed.

## Non-negotiables

- No code path touches real wallets, keys, chains, or broadcasts. There is nothing to hack toward — `tx_hash` values are prefixed `sim_`.
- Money math only in `numeric`/string domain end-to-end; floats allowed solely inside pure slippage math, rounded once at the boundary.
