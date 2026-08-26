# SVEE TERMINAL — Project Structure

Next.js App Router. Two route groups: `(marketing)` = public pages (landing, auth, public profiles), `(terminal)` = the authenticated app. Everything else lives in `src/`.

```
svee/
├── docs/                              # Engineering specs (this folder)
│   ├── 01-project-structure.md
│   ├── 02-database-schema.md
│   ├── 03-design-system.md
│   ├── 04-component-list.md
│   ├── 05-api-routes.md
│   ├── 06-trading-engine-spec.md
│   └── 07-landing-copy.md
├── supabase/
│   ├── migrations/
│   │   ├── 00001_initial_schema.sql   # Tables, constraints, indexes
│   │   ├── 00002_rls_policies.sql     # Row Level Security
│   │   └── 00003_leaderboard_fn.sql   # Snapshot RPC + triggers
│   └── seed.sql                       # Achievements catalog
├── public/
│   ├── icons/                         # PWA icons (192/512)
│   ├── manifest.json                  # PWA manifest
│   └── og.png                         # Open Graph share image
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout: fonts, providers
│   │   ├── globals.css                # Design tokens (@theme) + base styles
│   │   ├── page.tsx                   # → redirects into (marketing)/page
│   │   ├── (marketing)/
│   │   │   ├── layout.tsx             # Minimal marketing chrome
│   │   │   ├── page.tsx               # Landing page
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── u/[username]/page.tsx  # Public trader profile (shareable)
│   │   ├── (terminal)/
│   │   │   ├── layout.tsx             # Auth guard + Sidebar + Topbar shell
│   │   │   ├── trade/page.tsx         # Flagship: chart + order panel + analytics
│   │   │   ├── trade/[chain]/[address]/page.tsx
│   │   │   ├── discover/page.tsx      # Trending / new pairs / gainers / search
│   │   │   ├── pulse/page.tsx         # Momentum + volume spike feed
│   │   │   ├── portfolio/page.tsx     # Holdings, PnL, history
│   │   │   ├── leaderboard/page.tsx
│   │   │   └── settings/page.tsx      # Preferences, layouts, reset
│   │   └── api/                       # See docs/05-api-routes.md
│   │       ├── me/route.ts
│   │       ├── portfolio/reset/route.ts
│   │       ├── portfolio/history/route.ts
│   │       ├── orders/route.ts
│   │       ├── orders/[orderId]/route.ts        # GET status · DELETE cancel
│   │       ├── positions/route.ts
│   │       ├── positions/[positionId]/close/route.ts
│   │       ├── trades/route.ts
│   │       ├── market/price/route.ts            # Batch quotes (polling heartbeat)
│   │       ├── market/candles/route.ts
│   │       ├── market/search/route.ts
│   │       ├── market/discover/route.ts         # trending | new | gainers | losers
│   │       ├── market/token/[chain]/[address]/route.ts
│   │       ├── leaderboard/route.ts
│   │       ├── u/[username]/route.ts
│   │       ├── watchlist/route.ts
│   │       ├── watchlist/[itemId]/route.ts
│   │       ├── achievements/route.ts
│   │       └── engine/tick/route.ts             # Cron-guarded matcher + snapshots
│   ├── components/
│   │   ├── ui/                        # shadcn/ui primitives (button, dialog, …)
│   │   ├── layout/                    # AppSidebar, Topbar, ChainSwitcher,
│   │   │                              # SearchCommand, UserMenu, BalancePill
│   │   ├── chart/                     # PriceChart, TimeframeBar, ChartToolbar,
│   │   │                              # IndicatorPanel, VolumeHistogram
│   │   ├── order-panel/               # OrderPanel, OrderTypeTabs, SizeSelector,
│   │   │                              # QuickBuyPresets, FeePreview, ExitPlanBuilder
│   │   ├── analytics/                 # TokenStatsGrid, TopHolders, SafetyChecks,
│   │   │                              # TokenHeader, RecentTrades
│   │   ├── portfolio/                 # EquityCurve, PositionsTable, ClosedPositions,
│   │   │                              # StatsStrip, AllocationBreakdown
│   │   ├── leaderboard/               # LeaderboardTable, PeriodTabs, ProfileStats
│   │   ├── discover/                  # DiscoverTabs, TokenTable, TokenCard,
│   │   │                              # MomentumCard
│   │   └── shared/                    # PriceFlash, CountUp, PnlText, Skeletons,
│   │                                  # EmptyState, ErrorState, ConfirmDialog
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              # Browser client
│   │   │   ├── server.ts              # Server component / route handler client
│   │   │   └── admin.ts               # Service-role client (engine only)
│   │   ├── engine/
│   │   │   ├── execute.ts             # Market order execution pipeline
│   │   │   ├── match.ts               # Limit/stop/TP trigger evaluation
│   │   │   ├── slippage.ts            # Slippage model (pure functions)
│   │   │   ├── fees.ts                # Fee schedule (pure functions)
│   │   │   ├── pnl.ts                 # Average-cost basis + PnL math
│   │   │   ├── latency.ts             # Simulated network latency sampler
│   │   │   └── constants.ts           # All tunable simulation parameters
│   │   ├── market-data/
│   │   │   ├── dexscreener.ts         # Primary provider adapter
│   │   │   ├── geckoterminal.ts       # Fallback provider adapter
│   │   │   ├── cache.ts               # In-memory TTL cache (Redis-swappable)
│   │   │   └── candles.ts             # OHLCV fetch + resample
│   │   ├── leaderboard/compute.ts     # Snapshot builder
│   │   ├── achievements/check.ts      # Post-trade achievement evaluator
│   │   ├── utils.ts                   # cn() + formatters
│   │   └── format.ts                  # Money/price/percent/compact formatters
│   ├── hooks/
│   │   ├── use-price-stream.ts        # Polling heartbeat w/ visibility pause
│   │   ├── use-positions.ts           # React Query wrappers
│   │   ├── use-orders.ts
│   │   ├── use-token-market.ts
│   │   └── use-keyboard-shortcuts.ts  # B/S focus, preset keys
│   ├── stores/
│   │   ├── terminal-store.ts          # Zustand: active token, timeframe, panel prefs
│   │   └── order-form-store.ts        # Draft order state (persists across tabs)
│   ├── types/
│   │   ├── database.types.ts          # Generated Supabase types
│   │   ├── trading.ts                 # Order, Position, Trade, Portfolio domain types
│   │   └── market.ts                  # TokenOverview, Candle, Quote types
│   └── middleware.ts                  # Session refresh + route protection
├── .env.local.example
├── .eslintrc.json
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
└── vercel.json                        # Cron: */1 min engine tick
```

## Conventions

- **Route groups**: never leak into URLs — `/trade`, `/discover`, `/u/alice`.
- **Server Components by default**; `"use client"` only where interactivity demands it (charts, forms, live tables).
- **Data fetching**: React Query on the client for anything live; direct Supabase reads in Server Components for static shells.
- **Engine code (`lib/engine/*`) is pure and unit-testable** — no imports from React or Next.
- **One provider adapter per data source** in `lib/market-data/` so swapping Birdeye in later touches one file.
