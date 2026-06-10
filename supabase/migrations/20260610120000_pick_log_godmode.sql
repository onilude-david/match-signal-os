-- VIP "god mode" pick log + CLV tracking.
--
-- The pick_log table existed in schema.sql but never had a migration, so a
-- migrate-only deploy crashed VIP audit logging. This migration creates it
-- idempotently AND adds the god-mode columns (line, fair_prob, edge,
-- devig_method) used by the multi-market engine.

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
  closing_price numeric,   -- backfilled at kickoff for CLV
  result text,             -- 'Win' | 'Loss' | 'Void' | null until settled
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- God-mode columns (safe to run repeatedly).
alter table public.pick_log
  add column if not exists line numeric,         -- totals line (e.g. 2.5)
  add column if not exists fair_prob numeric,    -- de-vigged market fair prob
  add column if not exists edge numeric,         -- model_prob - fair_prob
  add column if not exists devig_method text,    -- 'shin' | 'multiplicative'
  add column if not exists clv numeric;          -- closing line value, set on settle

create index if not exists pick_log_match_id_idx on public.pick_log (match_id);
create index if not exists pick_log_created_at_idx on public.pick_log (created_at desc);
create index if not exists pick_log_result_idx on public.pick_log (result);
