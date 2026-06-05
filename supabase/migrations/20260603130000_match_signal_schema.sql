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
