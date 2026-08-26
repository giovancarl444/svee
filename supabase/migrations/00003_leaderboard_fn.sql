-- ============================================================
-- SVEE TERMINAL :: migration 00003 — leaderboard snapshot RPC
-- Called by the engine tick via service role.
-- ============================================================

create or replace function public.rebuild_leaderboard(
  p_period_type text,           -- 'daily' | 'weekly' | 'monthly' | 'all_time'
  p_period_start date
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_from timestamptz;
  v_inserted integer;
begin
  v_from := case p_period_type
    when 'daily'    then p_period_start::timestamptz
    when 'weekly'   then p_period_start::timestamptz
    when 'monthly'  then p_period_start::timestamptz
    else '-infinity'::timestamptz
  end;

  -- Wipe this period's previous snapshot, then rebuild from the trades ledger.
  delete from public.leaderboard_snapshots
   where period_type = p_period_type and period_start = p_period_start;

  with stats as (
    select
      t.portfolio_id,
      pf.user_id,
      count(*)                                              as total_trades,
      sum(t.quote_value)                                    as volume,
      sum(case when t.side = 'sell' then coalesce(t.realized_pnl, 0) else 0 end) as pnl,
      sum(case when t.side = 'sell' and coalesce(t.realized_pnl, 0) > 0 then 1 else 0 end)
        / nullif(sum(case when t.side = 'sell' then 1 else 0 end), 0)::numeric * 100 as win_rate
    from public.trades t
    join public.portfolios pf on pf.id = t.portfolio_id
    where t.created_at >= v_from
    group by t.portfolio_id, pf.user_id
  ),
  ranked as (
    select
      s.user_id, s.pnl, s.win_rate, s.total_trades, s.volume,
      row_number() over (order by s.pnl desc nulls last) as rank
    from stats s
    where s.total_trades > 0
  )
  insert into public.leaderboard_snapshots
    (period_type, period_start, user_id, rank, pnl, roi_pct, win_rate, total_trades, volume)
  select
    p_period_type, p_period_start,
    r.user_id, r.rank::int, r.pnl,
    case when po.starting_balance > 0 then (r.pnl / po.starting_balance) * 100 end,
    r.win_rate, r.total_trades::int, r.volume
  from ranked r
  join public.portfolios po on po.user_id = r.user_id;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

comment on function public.rebuild_leaderboard(text, date) is
  'Recomputes one leaderboard period from the immutable trades ledger. Service-role only.';
