-- ============================================================
-- SVEE TERMINAL :: seed — achievement catalog
-- Safe to re-run (upsert semantics).
-- ============================================================

insert into public.achievements (id, name, description, icon, tier) values
  ('first_trade',      'First Blood',        'Place your first trade.',                        'swords',   'bronze'),
  ('ten_trades',       'Warmed Up',          'Complete 10 trades.',                            'flame',    'bronze'),
  ('hundred_trades',   'Terminal Rat',       'Complete 100 trades.',                           'terminal', 'silver'),
  ('first_green',      'In The Green',       'Close your first profitable position.',          'sprout',   'bronze'),
  ('two_x',            'Double Up',          'Close a position at +100% or better.',           'trending', 'silver'),
  ('ten_x',            'Decuple',            'Close a position at +900% or better.',           'rocket',   'gold'),
  ('hundred_x',        'Fictional Legend',   'Close a position at +9900% or better.',          'crown',    'legendary'),
  ('win_streak_5',     'Heater',             'Five profitable closes in a row.',               'fire',     'silver'),
  ('sniper',           'Sniper',             'Fill a limit order at a better price than mark.', 'crosshair','silver'),
  ('iron_hands',       'Diamond Hands',      'Hold an open position through a -50% drawdown without selling.', 'gem', 'gold'),
  ('diversified',      'Portfolio Manager',  'Hold 10 open positions at once.',                'pie',      'bronze'),
  ('no_reset_week',    'Discipline',         'Trade 7 days without resetting your account.',   'shield',   'silver')
on conflict (id) do update
  set name        = excluded.name,
      description = excluded.description,
      icon        = excluded.icon,
      tier        = excluded.tier;
