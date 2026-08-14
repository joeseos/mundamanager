-- Index every foreign key that lacks a covering index on a table big enough
-- for the missing index to hurt.
--
-- Why this matters beyond query plans: when a parent row is deleted or its key
-- updated, Postgres must find the referencing children. With no index on the
-- referencing column that check is a sequential scan of the child table, taken
-- while the parent row is locked. fighters is 457 MB and fighter_effects is
-- 137 MB, so an unindexed CASCADE means every delete of a fighter_type,
-- fighter_effect_type, fighter_skill or exotic beast seq-scans hundreds of
-- megabytes. NO ACTION and RESTRICT are checked the same way -- only the
-- reaction to a match differs -- so they need the index too.
--
-- Sparse columns get a partial index. Most of these are optional links that are
-- NULL on the overwhelming majority of rows (fighters.active_loadout_id is
-- 99.8% NULL, fighter_skills.fighter_injury_id is 100% NULL), and a partial
-- index stores only the rows that actually point somewhere. The referential
-- integrity check still uses it: it probes with `col = <deleted key>`, and
-- `col = <non-null const>` implies `col IS NOT NULL`, so the planner can prove
-- the predicate holds and the index is eligible.
--
-- HOW TO APPLY: CREATE INDEX CONCURRENTLY cannot run inside a transaction
-- block, so this file must NOT be wrapped in BEGIN/COMMIT and must not be fed
-- through a runner that opens one (`psql -1`, or a multi-statement POST to the
-- SQL editor). Run it with `psql -f <this file>` against the pooler-bypassing
-- direct connection, or paste the statements one at a time. CONCURRENTLY is
-- deliberate: a plain CREATE INDEX takes a SHARE lock that blocks every write
-- to the table for the duration of the build, which on the 457 MB fighters
-- table means a visible write stall for live users.
--
-- If a CONCURRENTLY build is interrupted it leaves an INVALID index behind that
-- is never used but still costs write overhead. Check afterwards with:
--   select indrelid::regclass, indexrelid::regclass from pg_index
--   where not indisvalid;
-- and DROP INDEX any that turn up, then re-run this file (IF NOT EXISTS makes
-- the already-built ones no-ops).
--
-- Row counts quoted below were measured on production on 2026-08-14.

-- ---------------------------------------------------------------------------
-- fighters (592,378 rows, 457 MB)
-- ---------------------------------------------------------------------------

-- CASCADE from fighter_types, and the column is populated on 99.7% of fighters,
-- so this is a plain index. Also serves the fighter -> fighter_type joins that
-- the gang detail queries lean on.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighters_fighter_type_id_idx
  ON public.fighters USING btree (fighter_type_id);

-- CASCADE from fighter_exotic_beasts, which is itself CASCADEd from
-- fighter_equipment. Deleting a piece of equipment that granted a pet therefore
-- seq-scans all of fighters today; this is the hottest of the unindexed cascade
-- paths. 18,819 of 592,378 rows are non-NULL.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighters_fighter_pet_id_idx
  ON public.fighters USING btree (fighter_pet_id)
  WHERE fighter_pet_id IS NOT NULL;

-- The remaining fighters FKs are all ON DELETE SET NULL on optional columns.
-- Partial indexes keep them small: 0.2% to 8.9% of rows are non-NULL.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighters_active_loadout_id_idx
  ON public.fighters USING btree (active_loadout_id)
  WHERE active_loadout_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS fighters_custom_fighter_type_id_idx
  ON public.fighters USING btree (custom_fighter_type_id)
  WHERE custom_fighter_type_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS fighters_fighter_gang_legacy_id_idx
  ON public.fighters USING btree (fighter_gang_legacy_id)
  WHERE fighter_gang_legacy_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS fighters_fighter_specialisation_id_idx
  ON public.fighters USING btree (fighter_specialisation_id)
  WHERE fighter_specialisation_id IS NOT NULL;

-- Restores the index that migration 20260203143001_add_selected_archetype_id_to_fighters.sql
-- declared but which is absent from production -- see the drift note at the
-- bottom of this file. Same shape as the original, renamed to match the
-- <table>_<column>_idx convention used throughout this migration.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighters_selected_archetype_id_idx
  ON public.fighters USING btree (selected_archetype_id)
  WHERE selected_archetype_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- fighter_effects (360,622 rows, 137 MB)
-- ---------------------------------------------------------------------------

-- CASCADE from fighter_effect_types, fully populated.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighter_effects_fighter_effect_type_id_idx
  ON public.fighter_effects USING btree (fighter_effect_type_id);

-- CASCADE from fighter_skills. Removing a skill from a fighter is an ordinary
-- user action and currently seq-scans 137 MB. 99.2% NULL, so partial.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighter_effects_fighter_skill_id_idx
  ON public.fighter_effects USING btree (fighter_skill_id)
  WHERE fighter_skill_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- fighter_skills (316,189 rows, 67 MB)
-- ---------------------------------------------------------------------------

-- NO ACTION rather than CASCADE, but the referencing-row lookup on skills
-- delete is identical. Populated on 99.9% of rows, and joined on every skill
-- lookup.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighter_skills_skill_id_idx
  ON public.fighter_skills USING btree (skill_id);

-- CASCADE from fighter_effect_skills, 97.0% NULL.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighter_skills_fighter_effect_skill_id_idx
  ON public.fighter_skills USING btree (fighter_effect_skill_id)
  WHERE fighter_effect_skill_id IS NOT NULL;

-- CASCADE from fighter_injuries. Currently 100% NULL, so this index is
-- essentially empty -- it costs nothing and removes a 67 MB seq scan from every
-- fighter_injuries delete the moment the column starts being written.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighter_skills_fighter_injury_id_idx
  ON public.fighter_skills USING btree (fighter_injury_id)
  WHERE fighter_injury_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- gangs (86,083 rows, 60 MB)
-- ---------------------------------------------------------------------------

-- CASCADE from gang_types, populated on 99.9% of gangs.
CREATE INDEX CONCURRENTLY IF NOT EXISTS gangs_gang_type_id_idx
  ON public.gangs USING btree (gang_type_id);

-- Both SET NULL and both sparse (15.7% and 4.6% non-NULL).
CREATE INDEX CONCURRENTLY IF NOT EXISTS gangs_gang_origin_id_idx
  ON public.gangs USING btree (gang_origin_id)
  WHERE gang_origin_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS gangs_gang_affiliation_id_idx
  ON public.gangs USING btree (gang_affiliation_id)
  WHERE gang_affiliation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Exotic beasts, campaigns and campaign territories
-- ---------------------------------------------------------------------------

-- CASCADE from fighter_equipment (1.87 M rows) into fighter_exotic_beasts
-- (18,578 rows). Every equipment delete pays a seq scan here.
CREATE INDEX CONCURRENTLY IF NOT EXISTS fighter_exotic_beasts_fighter_equipment_id_idx
  ON public.fighter_exotic_beasts USING btree (fighter_equipment_id);

-- 52,585 rows, SET NULL, 93.4% NULL.
CREATE INDEX CONCURRENTLY IF NOT EXISTS campaign_territories_map_object_id_idx
  ON public.campaign_territories USING btree (map_object_id)
  WHERE map_object_id IS NOT NULL;

-- 14,472 rows, effectively one row per campaign member.
CREATE INDEX CONCURRENTLY IF NOT EXISTS campaign_gangs_campaign_member_id_idx
  ON public.campaign_gangs USING btree (campaign_member_id);

-- campaigns is only 5,309 rows, but created_by backs the "campaigns I own"
-- lookups and campaign_type_id is RESTRICT, so deleting a campaign type scans
-- the table to prove no campaign uses it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS campaigns_created_by_idx
  ON public.campaigns USING btree (created_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS campaigns_campaign_type_id_idx
  ON public.campaigns USING btree (campaign_type_id);

-- ---------------------------------------------------------------------------
-- Schema drift: indexes declared in earlier migrations that never reached
-- production. Recreated here under their original names so the repo and the
-- live database agree.
--
-- 20260222090000_create_custom_skill_types.sql declared these two; neither
-- exists in production, and both columns are unindexed foreign keys. The tables
-- are small today, so this is about consistency rather than performance.
-- ---------------------------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_custom_skills_custom_skill_type_id
  ON public.custom_skills USING btree (custom_skill_type_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ftsa_custom_skill_type_id
  ON public.fighter_type_skill_access USING btree (custom_skill_type_id);

-- ---------------------------------------------------------------------------
-- Deliberately NOT indexed
--
-- Roughly forty further foreign keys are unindexed on tables that are empty or
-- hold at most a few thousand rows: the custom_trading_post_* and
-- custom_fighter_type_* configuration tables, fighter_ooa_records,
-- battle_session_fighters, campaign_battles, fighter_skill_access_override,
-- fighter_defaults, gang_stash and the reference tables. A sequential scan of a
-- table that fits in a handful of pages is faster than an index probe, and the
-- index would only add write overhead. Revisit any of them if it passes roughly
-- 10k rows.
--
-- fighter_types_gang_type_edition_fkey spans (gang_type_id, edition_id) and has
-- no matching two-column index. fighter_types is 408 kB, so it is left alone;
-- the existing single-column fighter_types_gang_type_id_idx already serves the
-- query-side joins.
-- ---------------------------------------------------------------------------
