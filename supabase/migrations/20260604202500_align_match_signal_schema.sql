alter table public.fixtures
  add column if not exists home_odds numeric,
  add column if not exists draw_odds numeric,
  add column if not exists away_odds numeric;

alter table public.content_outputs
  add column if not exists betting_angle text;
