-- ============================================================
-- SVEE TERMINAL :: migration 00001 — initial schema
-- Simulated trading only — no real funds move through this DB.
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------- PROFILES (public identity, decoupled from auth) ----------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     citext unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text,
  avatar_url   text,
  bio          text check (char_length(bio) <= 280),
  is_public    boolean not null default true,
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
  cash_usdc        numeric(20,6) not null default 10000.000000 check (cash_usdc >= 0),
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
  status           text not null default 'open' check (status in ('open','closed')),
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz
);
-- One OPEN row per token per portfolio; closed rows accumulate as history.
create unique index positions_open_unique
  on public.positions (portfolio_id, chain, token_address)
  where status = 'open';
create index positions_portfolio_status_idx on public.positions (portfolio_id, status);

-- ---------- ORDERS ----------
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  idempotency_key   uuid unique,
  portfolio_id      uuid not null references public.portfolios(id) on delete cascade,
  side              text not null check (side in ('buy','sell')),
  order_type        text not null check (order_type in ('market','limit','stop_loss','take_profit')),
  status            text not null default 'submitted'
                    check (status in ('submitted','pending','open','filled','cancelled','expired','failed')),
  chain             text not null default 'solana',
  token_address     text not null,
  token_symbol      text,
  quote_amount      numeric(20,6) check (quote_amount is null or quote_amount > 0),
  qty               numeric(38,12) check (qty is null or qty > 0),
  sell_pct          numeric(5,2) check (sell_pct is null or sell_pct between 0 and 100),
  limit_price       numeric(30,12),
  stop_price        numeric(30,12),
  take_profit_price numeric(30,12),
  reduce_only       boolean not null default false,
  parent_order_id   uuid references public.orders(id) on delete cascade,
  exit_plan         jsonb,
  filled_qty        numeric(38,12) not null default 0 check (filled_qty >= 0),
  avg_fill_price    numeric(30,12),
  slippage_bps      numeric(10,2),
  fee_total         numeric(20,6) not null default 0,
  fee_breakdown     jsonb,
  latency_ms        integer,
  fail_reason       text,
  reference_price   numeric(30,12),
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- BUY must carry quote_amount; SELL carries exactly one of qty / sell_pct.
alter table public.orders add constraint orders_side_payload_check check (
  (side = 'buy'  and quote_amount is not null and qty is null and sell_pct is null) or
  (side = 'sell' and quote_amount is null and ((qty is not null)::int + (sell_pct is not null)::int) = 1)
);
-- Resting order types must carry an expiry; market orders never do.
alter table public.orders add constraint orders_expires_required check (
  (order_type in ('limit','stop_loss','take_profit')) or (expires_at is null)
);

create index orders_open_matcher_idx
  on public.orders (status, expires_at)
  where status in ('submitted','pending','open');
create index orders_portfolio_idx on public.orders (portfolio_id, created_at desc);

-- ---------- TRADES (immutable fill ledger) ----------
create table public.trades (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  position_id  uuid references public.positions(id) on delete set null,
  side         text not null check (side in ('buy','sell')),
  qty          numeric(38,12) not null check (qty > 0),
  price        numeric(30,12) not null check (price > 0),
  quote_value  numeric(20,6) not null,
  fee          numeric(20,6) not null default 0,
  realized_pnl numeric(20,6),
  tx_hash      text not null default ('sim_' || replace(gen_random_uuid()::text, '-', '')),
  created_at   timestamptz not null default now()
);
create index trades_portfolio_idx on public.trades (portfolio_id, created_at desc);

-- ---------- LEADERBOARD SNAPSHOTS ----------
create table public.leaderboard_snapshots (
  id           uuid primary key default gen_random_uuid(),
  period_type  text not null check (period_type in ('daily','weekly','monthly','all_time')),
  period_start date not null,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  rank         integer not null,
  pnl          numeric(20,6) not null,
  roi_pct      numeric(12,4),
  win_rate     numeric(5,2),
  total_trades integer not null default 0,
  volume       numeric(20,6) not null default 0,
  computed_at  timestamptz not null default now(),
  unique (period_type, period_start, user_id)
);
create index leaderboard_rank_idx
  on public.leaderboard_snapshots (period_type, period_start, rank);

-- ---------- ACHIEVEMENTS ----------
create table public.achievements (
  id          text primary key,
  name        text not null,
  description text not null,
  icon        text not null default 'trophy',
  tier        text not null default 'bronze' check (tier in ('bronze','silver','gold','legendary'))
);

create table public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  progress       jsonb,
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
  added_price   numeric(30,12),
  added_at      timestamptz not null default now(),
  unique (watchlist_id, chain, token_address)
);

-- ---------- PRICE CACHE ----------
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
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
