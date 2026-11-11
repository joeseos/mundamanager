BEGIN;

-- ============================================================================
-- ONE SCENARIO TABLE PER TYPE AND GANG TYPE
-- The admin edits Deployments, Objectives, Side Jobs and Crew, picking a gang
-- type for a house's own Side Jobs. The table behind them is found, or made
-- with its first entry, from the edition, type and gang type, so those three
-- must name at most one table.
--
-- NULLS NOT DISTINCT makes the core table (gang_type_id NULL) one of those, so
-- this replaces the core-only index from 20261010120000.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scenario_tables_edition_type_gang_type_key'
      AND conrelid = 'public.scenario_tables'::regclass
  ) THEN
    ALTER TABLE public.scenario_tables
      ADD CONSTRAINT scenario_tables_edition_type_gang_type_key
      UNIQUE NULLS NOT DISTINCT (edition_id, table_type, gang_type_id);
  END IF;
END $$;

DROP INDEX IF EXISTS public.scenario_tables_edition_core_uidx;

-- ============================================================================
-- ONE ENTRY PER D6 RESULT
-- Every line of an N26 table is a single result, so a roll must match exactly
-- one entry of its table.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scenario_table_entries_scenario_table_id_d6_min_key'
      AND conrelid = 'public.scenario_table_entries'::regclass
  ) THEN
    ALTER TABLE public.scenario_table_entries
      ADD CONSTRAINT scenario_table_entries_scenario_table_id_d6_min_key
      UNIQUE (scenario_table_id, d6_min);
  END IF;
END $$;

-- The tables were still empty when this was written. If adding a constraint
-- fails, rows already share its key: delete one and run this again. Nothing
-- changes until it succeeds.

COMMIT;
