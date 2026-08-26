# SVEE Terminal

Paper-trading terminal (Axiom/Padre-style) + the **execution/proof half** of a
signal→execution→proof loop with **MEGAPHONE** (pump.fun callout engine).

The combined system: MEGAPHONE generates curated pump.fun calls → logs them to
a shared ledger → SVEE shows them in the **Callouts** view (track record + one
-click Trade) → you execute as paper trades → resolve → the win-rate/multiple
becomes the verified record that drives followers on pump.fun.

## Stack

Next.js 16 · React 19 · Tailwind v4 · TypeScript strict. Engine is pure
(`src/lib/engine/*`), file-backed paper store (`src/lib/store/paper.ts`),
DexScreener quotes/search (`src/lib/market-data/dexscreener.ts`).

## Run

```bash
npm install
npm run dev        # http://localhost:3400
```

## Callouts integration

`GET /api/callouts` reads `../megaphone/.megaphone/callouts.json` (override via
`MEGAPHONE_DIR`). The **Callouts** nav entry shows the live track record and a
table of calls; each row's **Trade** button deep-links `/trade?address=&symbol=`
so the call loads straight into the live chart + order panel.

## Status

- Engine: LIVE, file-backed, idempotent (POST /api/orders executes real-quote
  market buys/sells, verified: BUY BONK $250 → 19,940 tokens, 29.6bps slip).
- Callouts view: wired, reads MEGAPHONE ledger.
- Supabase + auth: NOT applied (migrations written, no project yet).
- GT candles: fallback to local quote-history ring buffer (CLMM pools 404).
