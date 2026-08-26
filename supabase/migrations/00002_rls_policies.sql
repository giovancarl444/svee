-- ============================================================
-- SVEE TERMINAL :: migration 00002 — Row Level Security
-- Users own their data; public surfaces are read-only;
-- the engine writes via service role (bypasses RLS).
-- ============================================================

alter table public.profiles              enable row level security;
alter table public.portfolios            enable row level security;
alter table public.positions             enable row level security;
alter table public.orders                enable row level security;
alter table public.trades                enable row level security;
alter table public.leaderboard_snapshots enable row level security;
alter table public.achievements          enable row level security;
alter table public.user_achievements     enable row level security;
alter table public.watchlists            enable row level security;
alter table public.watchlist_items       enable row level security;
alter table public.price_cache           enable row level security;

-- ---- Ownership ----
create policy "own_profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own_portfolio" on public.portfolios
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own_positions" on public.positions
  for all using (
    portfolio_id in (select id from public.portfolios where user_id = auth.uid())
  ) with check (
    portfolio_id in (select id from public.portfolios where user_id = auth.uid())
  );

create policy "own_orders" on public.orders
  for all using (
    portfolio_id in (select id from public.portfolios where user_id = auth.uid())
  );

create policy "own_trades" on public.trades
  for all using (
    portfolio_id in (select id from public.portfolios where user_id = auth.uid())
  );

create policy "own_watchlists" on public.watchlists
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own_wl_items" on public.watchlist_items
  for all using (
    watchlist_id in (select id from public.watchlists where user_id = auth.uid())
  );

create policy "own_achievements" on public.user_achievements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- Public reads ----
create policy "public_profiles" on public.profiles
  for select using (is_public = true);

create policy "public_leaderboard" on public.leaderboard_snapshots
  for select using (true);

create policy "public_achievement_catalog" on public.achievements
  for select using (true);

-- Public profile pages read a PUBLIC trader's activity through these views.
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

-- price_cache: service-role-only (no policies → no client access).
