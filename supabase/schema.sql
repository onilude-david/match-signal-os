create table if not exists public.fixtures (
  match_id text primary key,
  match_date text,
  match_time text,
  team_a text not null,
  team_b text not null,
  stage text,
  venue text,
  status text,
  content_status text,
  source_id text,
  home_odds numeric,
  draw_odds numeric,
  away_odds numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_ratings (
  team text primary key,
  form_score numeric not null default 6,
  attack numeric not null default 6,
  defense numeric not null default 6,
  midfield numeric not null default 6,
  squad_depth numeric not null default 6,
  coach numeric not null default 6,
  injury_impact numeric not null default 2,
  motivation numeric not null default 7,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_outputs (
  match_id text primary key references public.fixtures(match_id) on delete cascade,
  telegram_post text,
  x_post text,
  thread text,
  shorts_script text,
  video_title text,
  report_section text,
  betting_angle text,
  safety_notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accuracy_records (
  match_id text primary key references public.fixtures(match_id) on delete cascade,
  final_score text,
  actual_winner text,
  model_read text not null default 'Pending',
  lesson text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  match_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- VIP picks audit log. One row per pick per publish, upserted on pick_id.
-- Used later for closing-line value tracking and ROI calculation. Public
-- surfaces never query this table.
create table if not exists public.pick_log (
  pick_id text primary key,
  match_id text references public.fixtures(match_id) on delete set null,
  market text not null,
  side text not null,
  label text,
  model_prob numeric not null,
  book_name text,
  book_price numeric not null,
  implied_prob numeric,
  ev numeric not null,
  stake_units numeric not null,
  confidence text,
  closing_price numeric,   -- backfilled later for CLV
  result text,             -- 'Win' | 'Loss' | 'Void' | null until settled
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pick_log_match_id_idx on public.pick_log (match_id);
create index if not exists pick_log_created_at_idx on public.pick_log (created_at desc);
