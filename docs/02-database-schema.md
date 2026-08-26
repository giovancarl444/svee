# SVEE TERMINAL — Database Schema

PostgreSQL on Supabase. Migration files mirror this exactly. Money is simulated USDC — `numeric`, never float.

## Entity map

```
auth.users (Supabase-managed)
  └─ profiles (1:1, public identity)
       └─ portfolios (1:1, the $10k paper account)
            ├─ positions (open/closed per token)
            ├─ orders (every order ever placed)
            │    └─ trades (fills; an order may produce 1 fill in MVP)
            ├─ watchlists → watchlist_items
            └─ user_achievements → achievements (catalog)
leaderboard_snapshots (period rankings, materialized by engine tick)
price_cache (last known real prices, written by market-data layer)
```

## `supabase/migrations/00001_initial_schema.sql`

```sql
-- ============================================================
-- SVEE TERMINAL :: initial schema
-- Simulated trading only — no real funds move through this DB.
-- ============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------- PROFILES (public identity, decoupled from auth) ----------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     citext unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text,
  avatar_url   text,
  bio          text check (char_length(bio) <= 280),
  is_public    boolean not null default true,          -- shareable profile page
  created_at   timestamptz not null default now()
);

-- Auto-create profile + portfolio on signup
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'trader_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'Anonymous Trader')
  );
  insert into public.portfolios (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- PORTFOLIOS ----------
create table public.portfolios (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.profiles(id) on delete cascade,
  cash_usdc        numeric(20,6) not null default 10000.000000
                   check (cash_usdc >= 0),
  starting_balance numeric(20,6) not null default 10000.000000,
  realized_pnl     numeric(20,6) not null default 0,
  fees_paid        numeric(20,6) not null default 0,
  reset_count      integer not null default 0,
  last_reset_at    timestamptz
);

-- ---------- POSITIONS ----------
create table public.positions (
  id               uuid primary key default gen_random_uuid(),
  portfolio_id     uuid not null references public.portfolios(id) on delete cascade,
  chain            text not null default 'solana',
  token_address    text not null,
  token_symbol     text not null,
  token_name       text,
  qty              numeric(38,12) not null default 0 check (qty >= 0),
  avg_entry_price  numeric(30,12) not null default 0 check (avg_entry_price >= 0),
  invested_usdc    numeric(20,6) not null default 0 check (invested_usdc >= 0),
  status           text not null default 'open'
                   check (status in ('open','closed')),
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,
  unique (portfolio_id, chain, token_address, status)
);
-- One OPEN row per token per portfolio; closed rows accumulate as history.
create unique index positions_open_unique
  on public.positions (portfolio_id, chain, token_address)
  where status = 'open';
create index positions_portfolio_status_idx
  on public.positions (portfolio_id, status);

-- ---------- ORDERS ----------
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  idempotency_key     uuid unique,                       -- client-generated, retry-safe
  portfolio_id        uuid not null references public.portfolios(id) on delete cascade,
  side                text not null check (side in ('buy','sell')),
  order_type          text not null
                      check (order_type in ('market','limit','stop_loss','take_profit')),
  status              text not null default 'submitted'
                      check (status in ('submitted','pending','open',
                                        'filled','cancelled','expired','failed')),
  -- intent
  chain               text not null default 'solana',
  token_address       text not null,
  token_symbol        text,
  quote_amount        numeric(20,6)  -- BUY: USDC in. SELL: null (derive from pct)
                      check (quote_amount is null or quote_amount > 0),
  qty                 numeric(38,12)  -- SELL: exact or % of position (sell_pct)
                      check (qty is null or qty > 0),
  sell_pct            numeric(5,2) check (sell_pct is null or sell_pct between 0 and 100),
  limit_price         numeric(30,12),
  stop_price          numeric(30,12),
  take_profit_price   numeric(30,12),
  reduce_only         boolean not null default false,   -- exit-plan children
  parent_order_id     uuid references public.orders(id) on delete cascade,
  exit_plan           jsonb,   -- [{pct:25, tp:+0.30}, {pct:25, tp:+0.60}] on parents
  -- execution results
  filled_qty          numeric(38,12) not null default 0 check (filled_qty >= 0),
  avg_fill_price      numeric(30,12),
  slippage_bps        numeric(10,2),
  fee_total           numeric(20,6) not null default 0,
  fee_breakdown       jsonb,   -- {"platform":..,"network":..,"mev_event":null}
  latency_ms          integer,
  fail_reason         text,
  -- lifecycle
  reference_price     numeric(30,12),   -- market price at submission (audit trail)
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (
    (side = 'buy'  and quote_amount is not null and qty is null) or
    (side = 'sell' and (qty is not null) <> (sell_pct is not null))
  )
);
create index orders_open_matcher_idx
  on public.orders (status, expires_at)
  where status in ('submitted','pending','open');
create index orders_portfolio_idx on public.orders (portfolio_id, created_at desc);

alter table public.orders
  add constraint orders_expires_required
  check (order_type in ('limit','stop_loss','take_profit') or expires_at is null);

-- ---------- TRADES (immutable fill ledger) ----------
create table public.trades (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  portfolio_id  uuid not null references public.portfolios(id) on delete cascade,
  position_id   uuid references public.positions(id) on delete set null,
  side          text not null check (side in ('buy','sell')),
  qty           numeric(38,12) not null check (qty > 0),
  price         numeric(30,12) not null check (price > 0),
  quote_value   numeric(20,6) not null,     -- qty * price
  fee           numeric(20,6) not null default 0,
  realized_pnl  numeric(20,6),              -- populated on sells only
  tx_hash       text not null default ('sim_' || gen_random_uuid()::text),
                                                 -- fake hash: realism in the UI feed
  created_at    timestamptz not null default now()
);
create index trades_portfolio_idx on public.trades (portfolio_id, created_at desc);

-- ---------- LEADERBOARD SNAPSHOTS ----------
create table public.leaderboard_snapshots (
  id            uuid primary key default gen_random_uuid(),
  period_type   text not null check (period_type in ('daily','weekly','monthly','all_time')),
  period_start  date not null,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  rank          integer not null,
  pnl           numeric(20,6) not null,
  roi_pct       numeric(12,4),
  win_rate      numeric(5,2),
  total_trades  integer not null default 0,
  volume        numeric(20,6) not null default 0,
  computed_at   timestamptz not null default now(),
  unique (period_type, period_start, user_id)
);
create index leaderboard_rank_idx
  on public.leaderboard_snapshots (period_type, period_start, rank);

-- ---------- ACHIEVEMENTS (catalog + join) ----------
create table public.achievements (
  id          text primary key,               -- 'first_trade', 'ten_x', 'hundred_trades'
  name        text not null,
  description text not null,
  icon        text not null default 'trophy',
  tier        text not null default 'bronze'
              check (tier in ('bronze','silver','gold','legendary'))
);
-- Catalog seeded in supabase/seed.sql — app code never inserts here.

create table public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  progress       jsonb,                       -- optional context: {"roi": 10.2}
  primary key (user_id, achievement_id)
);

-- ---------- WATCHLISTS ----------
create table public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null default 'My Watchlist',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.watchlist_items (
  id            uuid primary key default gen_random_uuid(),
  watchlist_id  uuid not null references public.watchlists(id) on delete cascade,
  chain         text not null default 'solana',
  token_address text not null,
  token_symbol  text,
  added_price   numeric(30,12),               -- price when starred → instant "since added"
  added_at      timestamptz not null default now(),
  unique (watchlist_id, chain, token_address)
);

-- ---------- PRICE CACHE (written by market-data layer) ----------
create table public.price_cache (
  chain         text not null,
  token_address text not null,
  price_usd     numeric(30,12),
  liquidity_usd numeric(20,6),
  market_cap    numeric(24,6),
  volume_24h    numeric(24,6),
  updated_at    timestamptz not null default now(),
  primary key (chain, token_address)
);

-- ---------- updated_at trigger ----------
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
```

## `supabase/migrations/00002_rls_policies.sql`

```sql
alter table public.profiles            enable row level security;
alter table public.portfolios          enable row level security;
alter table public.positions           enable row level security;
alter table public.orders              enable row level security;
alter table public.trades              enable row level security;
alter table public.leaderboard_snapshots enable row level security;
alter table public.achievements        enable row level security;
alter table public.user_achievements   enable row level security;
alter table public.watchlists          enable row level security;
alter table public.watchlist_items     enable row level security;
alter table public.price_cache         enable row level security;

-- Own everything you own
create policy "own_profile"  on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own_portfolio" on public.portfolios
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_positions" on public.positions
  for all using (portfolio_id in (select id from public.portfolios where user_id = auth.uid()));
create policy "own_orders"   on public.orders
  for all using (portfolio_id in (select id from public.portfolios where user_id = auth.uid()));
create policy "own_trades"   on public.trades
  for all using (portfolio_id in (select id from public.portfolios where user_id = auth.uid()));
create policy "own_watchlists" on public.watchlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_wl_items" on public.watchlist_items
  for all using (watchlist_id in (select id from public.watchlists where user_id = auth.uid()));
create policy "own_achievements" on public.user_achievements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Public reads (viral sharing surface)
create policy "public_profiles" on public.profiles
  for select using (is_public = true);
create policy "public_leaderboard" on public.leaderboard_snapshots
  for select using (true);
create policy "public_achievement_catalog" on public.achievements
  for select using (true);

-- Public profile pages may read a PUBLIC trader's positions/trades via views:
create view public.public_positions as
  select p.* from public.positions p
  join public.portfolios pf on pf.id = p.portfolio_id
  join public.profiles pr   on pr.id = pf.user_id
  where pr.is_public = true;
create view public.public_trades as
  select t.* from public.trades t
  join public.portfolios pf on pf.id = t.portfolio_id
  join public.profiles pr   on pr.id = pf.user_id
  where pr.is_public = true;

-- Engine writes through service role (bypasses RLS). price_cache is
-- service-role-only: no policies = no client access.
```

## Design decisions

| Decision | Why |
|---|---|
| `numeric` everywhere money appears | Float rounding kills PnL credibility. |
| One open-position row per token (unique partial index) | Makes average-entry updates a single `UPDATE`, no merge logic. Closed rows preserve history. |
| `orders.idempotency_key` unique | Double-click "Buy" can never double-fill. Client generates a UUID per attempt. |
| Immutable `trades` ledger separate from `orders` | Orders are intents; trades are what actually filled. Public profiles render from trades. Fake `tx_hash` makes the UI feed look native to traders. |
| Leaderboard is a **snapshot table**, not a live query | Live ranking over 100k users = full scan per view. Engine recomputes on cadence; reads are indexed and free. |
| Achievements catalog + join table | Users unlock; we ship new badges without migrations. |
| `citext` usernames | Case-insensitive uniqueness without lower() everywhere. |
