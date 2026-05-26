-- Bass Lake — Phase 6: persistent profiles (appearance + progress + stats).
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- One row per anonymous player keyed by auth.uid(). Mirrors what the client
-- used to store only in localStorage so progress follows the player across
-- devices, plus appearance (kayak colors) and lifetime stats.

create table if not exists public.profiles (
  player_id        uuid primary key,                              -- = auth.uid()
  display_name     text        not null default 'Angler',

  -- Appearance (kayak customization) — short enum strings keyed against
  -- HULL_PALETTES / PFD_PALETTES / HAT_PALETTES in sketch.js
  hull_color       text        not null default 'navy',
  pfd_color        text        not null default 'orange',
  hat_color        text        not null default 'green',

  -- Mirror of playerState in sketch.js so a new device picks up where you
  -- left off the moment you sign in. JSONB so the client can evolve the
  -- shape without a migration.
  money            integer     not null default 200,
  level_current    text        not null default 'bassLake',
  levels_unlocked  jsonb       not null default '{"bassLake": true}'::jsonb,
  unlocks          jsonb       not null default
    '{"flies":{"fly":true,"nymph":true,"woolyBugger":true},"rod":0,"kayak":0,"sonar":false}'::jsonb,

  -- Lifetime stats — catches per species, biggest catch per species,
  -- derbies played, derbies won, total points, etc.
  stats            jsonb       not null default '{}'::jsonb,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists profiles_updated_idx on public.profiles (updated_at);

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists profiles_read         on public.profiles;
drop policy if exists profiles_insert_self  on public.profiles;
drop policy if exists profiles_update_self  on public.profiles;

-- Anyone signed in can read any profile (so derbies can show other players'
-- names and colors). Only the owner can write their own.
create policy profiles_read on public.profiles
  for select to authenticated using (true);

create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (player_id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated using (player_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Realtime — the client subscribes to its own profile so multiple tabs stay
-- in sync, and to peer profiles in a derby so their appearance updates live.
-- ----------------------------------------------------------------------------

alter publication supabase_realtime add table public.profiles;
