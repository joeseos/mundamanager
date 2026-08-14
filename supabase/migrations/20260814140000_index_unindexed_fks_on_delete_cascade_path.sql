-- Index the foreign keys that a gang/fighter delete cascades through.
--
-- Postgres indexes the *referenced* side of a foreign key automatically (it has
-- to, the PK is already there) but never the *referencing* side. That side is
-- what a DELETE needs: to delete a row the executor must find every child row
-- pointing at it, and with no index on the referencing column the only way to
-- do that is a full scan of the child table -- once per deleted parent row.
--
-- Every FK below sits on the cascade path under `gangs`, so all of them get
-- walked when a user deletes a gang or a fighter, and the scans multiply:
-- deleting one gang cascades to its fighters, each fighter to its loadouts,
-- skills and equipment, and each of *those* rows triggers another full scan of
-- a table measured in hundreds of megabytes. Measured on production before this
-- migration:
--
--   deleting a fighter_loadouts row  -> Seq Scan on fighters        (457 MB)
--   deleting a fighter_exotic_beasts -> Seq Scan on fighters        (457 MB)
--   deleting a fighter_skills row    -> Seq Scan on fighter_effects (137 MB)
--   deleting a fighter_injuries row  -> Seq Scan on fighter_skills  ( 67 MB)
--
-- Over the 22 minutes of instance uptime that pg_stat_statements covered,
-- DELETEs read 12.08 GB from disk across 358 calls -- 74.9% of all disk IO in
-- the window, from 0.19% of the queries. That works out to ~34 MB read per
-- delete against ~13 KB for an ordinary query. That is what was draining the
-- instance's disk IO budget.
--
-- These scans cannot be cached away: shared_buffers is 512 MB and fighters
-- alone is 457 MB, so one scan nearly fills the buffer pool and evicts the
-- working set on its way through. Hence the 6-12% cache hit rate on the
-- delete statements.
--
-- Most of these columns are overwhelmingly NULL -- only 0.19% of fighters have
-- an active_loadout_id, only 0.82% of fighter_effects belong to a skill -- so
-- the indexes are partial. A partial index still satisfies the foreign key
-- check: the check is `WHERE col = $1`, `=` is strict, so the planner proves the
-- predicate implies `col IS NOT NULL` and uses the index. Confirmed with hypopg
-- against production statistics before writing this migration; the plan for the
-- FK check drops from `Seq Scan (cost=0.00..65835.24)` to
-- `Index Scan (cost=0.03..2.25)`. Keeping them partial matters because these
-- are hot write paths -- fighters and fighter_effects take constant inserts and
-- updates, and a full index would add an entry for every row to save lookups on
-- a fraction of a percent of them.
--
-- Columns that are densely populated get a plain index; there is nothing to
-- exclude and the partial predicate would only cost the planner a proof step.
--
-- Plain CREATE INDEX, not CONCURRENTLY: these run inside the migration
-- transaction, and building a partial index over a few thousand rows is fast
-- even though the build scans the table once. The largest, on fighters, holds
-- ~1.1k entries. If this is ever applied to a much larger dataset, split it out
-- and use CREATE INDEX CONCURRENTLY outside a transaction instead.

BEGIN;

-- Sparse columns: partial indexes, NULLs excluded. -------------------------

-- 99.81% NULL (~1.1k rows indexed). Scanned on every fighter_loadouts delete,
-- which is itself on the cascade path under fighters.
CREATE INDEX IF NOT EXISTS fighters_active_loadout_id_idx
  ON public.fighters (active_loadout_id)
  WHERE active_loadout_id IS NOT NULL;

-- 96.57% NULL (~20k rows). Scanned on every fighter_exotic_beasts delete.
CREATE INDEX IF NOT EXISTS fighters_fighter_pet_id_idx
  ON public.fighters (fighter_pet_id)
  WHERE fighter_pet_id IS NOT NULL;

-- 99.18% NULL (~2.9k rows). Scanned on every fighter_skills delete -- the
-- single hottest of these, since fighter_skills rows are deleted in bulk when
-- a fighter goes.
CREATE INDEX IF NOT EXISTS fighter_effects_fighter_skill_id_idx
  ON public.fighter_effects (fighter_skill_id)
  WHERE fighter_skill_id IS NOT NULL;

-- 99.98% NULL (~72 rows). Scanned on every fighter_injuries delete.
CREATE INDEX IF NOT EXISTS fighter_skills_fighter_injury_id_idx
  ON public.fighter_skills (fighter_injury_id)
  WHERE fighter_injury_id IS NOT NULL;

-- 96.98% NULL (~9.3k rows). Scanned on every fighter_effect_skills delete.
CREATE INDEX IF NOT EXISTS fighter_skills_fighter_effect_skill_id_idx
  ON public.fighter_skills (fighter_effect_skill_id)
  WHERE fighter_effect_skill_id IS NOT NULL;

-- 98.66% NULL (~276 rows). Scanned on every fighter_loadouts delete.
CREATE INDEX IF NOT EXISTS battle_session_fighters_loadout_id_idx
  ON public.battle_session_fighters (loadout_id)
  WHERE loadout_id IS NOT NULL;

-- 97.27% NULL (~228 rows). Scanned on every gangs delete.
CREATE INDEX IF NOT EXISTS fighter_ooa_records_injured_gang_id_idx
  ON public.fighter_ooa_records (injured_gang_id)
  WHERE injured_gang_id IS NOT NULL;

-- Dense columns: plain indexes. --------------------------------------------

-- 1.66% NULL. Scanned on every gangs delete, alongside injured_gang_id above.
CREATE INDEX IF NOT EXISTS fighter_ooa_records_causing_gang_id_idx
  ON public.fighter_ooa_records (causing_gang_id);

-- Effectively never NULL. Scanned on every fighter_equipment delete, which is
-- the highest-frequency delete in the app.
CREATE INDEX IF NOT EXISTS fighter_exotic_beasts_fighter_equipment_id_idx
  ON public.fighter_exotic_beasts (fighter_equipment_id);

-- Never NULL. Scanned on every gangs delete.
CREATE INDEX IF NOT EXISTS gang_stash_gang_id_idx
  ON public.gang_stash (gang_id);

-- Never NULL. Scanned on every fighters delete.
CREATE INDEX IF NOT EXISTS fighter_injuries_fighter_id_idx
  ON public.fighter_injuries (fighter_id);

COMMIT;
