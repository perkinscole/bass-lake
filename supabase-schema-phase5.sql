-- Bass Lake — Phase 5: derby scoring trigger + score-column lockdown.
-- Run this once in the Supabase SQL Editor after the original schema.
-- Safe to re-run.

-- ----------------------------------------------------------------------------
-- Trigger: after each catch insert, recompute that player's score in this
-- derby from the source-of-truth catches table. Runs SECURITY DEFINER so it
-- can touch the score column even after we revoke direct UPDATE rights below.
-- ----------------------------------------------------------------------------

create or replace function public.update_player_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.derby_players
     set score = (
       select coalesce(sum(points), 0)
       from public.catches
       where derby_id = NEW.derby_id and player_id = NEW.player_id
     )
   where derby_id = NEW.derby_id and player_id = NEW.player_id;
  return NEW;
end;
$$;

drop trigger if exists catches_update_score on public.catches;
create trigger catches_update_score
  after insert on public.catches
  for each row execute function public.update_player_score();

-- ----------------------------------------------------------------------------
-- Column-level lockdown — without this, a cheater could UPDATE score=99999
-- on their own row directly through the API (RLS lets you update your own
-- row, and RLS has no column granularity). We revoke the broad UPDATE and
-- grant only `name`. The trigger above still updates `score` because it
-- runs with definer (table owner) privileges.
-- ----------------------------------------------------------------------------

revoke update on public.derby_players from authenticated;
grant  update (name) on public.derby_players to authenticated;
