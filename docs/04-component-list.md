# SVEE TERMINAL — Core Component List

Every React component for Phase 1, grouped by section. All TypeScript, all typed props, no `any`.

## Layout
| Component | Purpose |
|---|---|
| `AppShell` | Authenticated layout frame: sidebar + topbar + content slot |
| `AppSidebar` | Icon+label nav (Discover/Pulse/Trade/Portfolio/Leaderboard/Settings), collapsible |
| `Topbar` | Search trigger, chain switcher, cash balance pill, user menu |
| `ChainSwitcher` | Solana/Ethereum/Base/BNB selector (filters market data) |
| `SearchCommand` | ⌘K palette: token search → navigates to trade view |
| `UserMenu` | Avatar dropdown: profile, settings, sign out |
| `BalancePill` | Live paper USDC balance with count-up animation |

## Chart
| Component | Purpose |
|---|---|
| `PriceChart` | TradingView Lightweight Charts wrapper: candles + volume, live last-bar update |
| `TimeframeBar` | 1m/5m/15m/1h/4h/1d selector |
| `ChartToolbar` | Fullscreen, chart-type toggle, screenshot button |
| `IndicatorPanel` | RSI/MACD toggles (Phase 1: RSI only) |
| `VolumeHistogram` | Synced volume series under candles |

## Order panel
| Component | Purpose |
|---|---|
| `OrderPanel` | The right rail: buy/sell, type tabs, sizing, submit |
| `OrderTypeTabs` | Market / Limit / Stop-Loss / Take-Profit switcher |
| `SizeSelector` | Amount input + 25/50/75/Max quick-fill buttons |
| `QuickBuyPresets` | "Snipe $500"-style saved templates, one-tap |
| `FeePreview` | Slippage est., platform fee, network fee, total cost breakdown |
| `ExitPlanBuilder` | Multi-level TP ladder builder (+% / sell %) rows |
| `OrderStatusToast` | Submitted → Pending → Filled/Failed lifecycle feedback |
| `OpenOrdersTable` | Working orders with cancel buttons |

## Token analytics
| Component | Purpose |
|---|---|
| `TokenHeader` | Symbol/name, chain badge, price, 24h change, star/watch button |
| `TokenStatsGrid` | MC, liquidity, 24h vol, holders, ATH, pair age |
| `SafetyChecks` | Mint/freeze/LP-burned badges where data available |
| `TopHolders` | Top-10 holder distribution bars |
| `RecentTradesFeed` | Live simulated tape of recent fills on this token |
| `WatchlistButton` | Add/remove from watchlist |

## Portfolio
| Component | Purpose |
|---|---|
| `StatsStrip` | Total value, realized/unrealized PnL, ROI, win rate |
| `EquityCurve` | Area chart of portfolio value over time |
| `PositionsTable` | Open positions: size, avg entry, mark, uPnL, quick close/sell % |
| `ClosedPositions` | Realized history rows with expandable trade detail |
| `AllocationBreakdown` | Donut of cash vs per-token exposure |
| `ResetBalanceCard` | Reset to $10k with confirm dialog |

## Discover / Pulse
| Component | Purpose |
|---|---|
| `DiscoverTabs` | Trending / New Pairs / Top Gainers / Top Losers |
| `TokenTable` | Dense sortable table: symbol, price, 5m/1h/24h Δ, vol, liq, MC, age |
| `TokenCard` | Compact card variant for mobile/grid views |
| `MomentumCard` | Pulse feed item: spike metrics + sparkline + jump-to-trade |
| `VolumeSpikeBadge` | "Vol ×4" style anomaly flag |

## Leaderboard
| Component | Purpose |
|---|---|
| `LeaderboardTable` | Rank, trader, PnL, ROI, win rate, volume, trades |
| `PeriodTabs` | Daily / Weekly / Monthly / All-time |
| `ProfileStats` | Stat header block reused on public profiles |
| `TradeHistoryList` | Public trade feed with PnL per closed trade |
| `ShareProfileButton` | Copy svee.trade/u/<username> link |

## Shared primitives
| Component | Purpose |
|---|---|
| `PriceFlash` | Text that flashes green/red on value change direction |
| `CountUp` | Smooth numeric interpolation |
| `PnlText` | Signed, colored, %-suffixed PnL renderer |
| `Skeletons` | Table/card/chart skeletons matching final layout |
| `EmptyState` | Zero-data states with a nudge action |
| `ErrorState` | Retry affordances |
| `ConfirmDialog` | Destructive confirmations (reset balance, cancel order) |

shadcn/ui primitives underneath: `button, input, tabs, dialog, dropdown-menu, select, tooltip, toast(sonner), table, skeleton, badge, separator, scroll-area, command, popover, switch, slider`.
