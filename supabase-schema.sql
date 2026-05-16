-- Bass Lake — multiplayer / fishing derby schema
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: every statement is idempotent.

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- A derby is one time-limited competition on one procedurally-seeded lake.
create table if not exists public.derbies (
  id            uuid primary key default gen_random_uuid(),
  pin           text unique not null,             -- 6-char join code
  host_id       uuid not null,                    -- auth.uid() of the host
  level         text not null default 'bassLake', -- which biome
  lake_seed     bigint not null,                  -- everyone generates this lake
  duration_secs integer not null default 300,     -- derby length
  status        text not null default 'lobby',    -- lobby | live | done
  is_public     boolean not null default true,    -- joinable via matchmaking
  start_at      timestamptz,                      -- set when status -> live
  end_at        timestamptz,                      -- start_at + duration
  created_at    timestamptz not null default now()
);

-- One row per player per derby.
create table if not exists public.derby_players (
  id         uuid primary key default gen_random_uuid(),
  derby_id   uuid not null references public.derbies(id) on delete cascade,
  player_id  uuid not null,                       -- auth.uid()
  name       text not null default 'Angler',
  score      integer not null default 0,
  placement  integer,                             -- final rank, set when derby ends
  joined_at  timestamptz not null default now(),
  unique (derby_id, player_id)
);

-- One row per landed fish during a derby — the source of truth for scoring.
create table if not exists public.catches (
  id         uuid primary key default gen_random_uuid(),
  derby_id   uuid not null references public.derbies(id) on delete cascade,
  player_id  uuid not null,
  species    text not null,
  weight     numeric not null,
  points     integer not null,
  caught_at  timestamptz not null default now()
);

create index if not exists derbies_pin_idx        on public.derbies (pin);
create index if not exists derbies_open_idx       on public.derbies (is_public, status, created_at);
create index if not exists derby_players_did_idx  on public.derby_players (derby_id);
create index if not exists catches_did_idx        on public.catches (derby_id);

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- Anonymous (signed-in) players can read everything, but may only write rows
-- that belong to themselves. This blocks the obvious cheats (editing someone
-- else's score) without needing a custom server.
-- ----------------------------------------------------------------------------

alter table public.derbies       enable row level security;
alter table public.derby_players enable row level security;
alter table public.catches       enable row level security;

-- derbies ---------------------------------------------------------------------
drop policy if exists derbies_read       on public.derbies;
drop policy if exists derbies_insert     on public.derbies;
drop policy if exists derbies_host_update on public.derbies;

create policy derbies_read on public.derbies
  for select to authenticated using (true);

create policy derbies_insert on public.derbies
  for insert to authenticated with check (host_id = auth.uid());

create policy derbies_host_update on public.derbies
  for update to authenticated using (host_id = auth.uid());

-- derby_players ---------------------------------------------------------------
drop policy if exists players_read        on public.derby_players;
drop policy if exists players_insert_self on public.derby_players;
drop policy if exists players_update_self on public.derby_players;

create policy players_read on public.derby_players
  for select to authenticated using (true);

create policy players_insert_self on public.derby_players
  for insert to authenticated with check (player_id = auth.uid());

create policy players_update_self on public.derby_players
  for update to authenticated using (player_id = auth.uid());

-- catches ---------------------------------------------------------------------
drop policy if exists catches_read        on public.catches;
drop policy if exists catches_insert_self on public.catches;

create policy catches_read on public.catches
  for select to authenticated using (true);

create policy catches_insert_self on public.catches
  for insert to authenticated with check (player_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Realtime — let clients subscribe to live changes (leaderboard, derby status)
-- ----------------------------------------------------------------------------

alter publication supabase_realtime add table public.derbies;
alter publication supabase_realtime add table public.derby_players;
alter publication supabase_realtime add table public.catches;
