BEGIN;

-- ============================================================================
-- CUSTOM N26 CREW
-- A battle's Crew may be named by hand instead of rolled, as its Deployment,
-- Objective and each gang's Side Job may. A custom Crew has no entry, so its
-- name is kept beside crew_selection_id, and a battle has one or the other.
--
-- A custom Deployment or Objective is kept in the scenario text, which names
-- the battle; a Crew does not, so it gets a column. A battle log and a battle
-- session each keep it, and a session copies it to its log on completion, as
-- a challenge does to the session played from it.
--
-- Apply before the app code that reads it deploys: battle logs and sessions
-- select and save the column by name.
-- ============================================================================

ALTER TABLE public.campaign_battles
    ADD COLUMN IF NOT EXISTS crew_selection_name text;

COMMENT ON COLUMN public.campaign_battles.crew_selection_name IS
    'N26 custom Crew named by hand instead of rolled. NULL while '
    'crew_selection_id is set.';

ALTER TABLE public.battle_sessions
    ADD COLUMN IF NOT EXISTS crew_selection_name text;

COMMENT ON COLUMN public.battle_sessions.crew_selection_name IS
    'N26 custom Crew named by hand instead of rolled. NULL while '
    'crew_selection_id is set. Copied into campaign_battles on completion.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_battles_one_crew_selection_check'
      AND conrelid = 'public.campaign_battles'::regclass
  ) THEN
    ALTER TABLE public.campaign_battles
      ADD CONSTRAINT campaign_battles_one_crew_selection_check
      CHECK (crew_selection_id IS NULL OR crew_selection_name IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'battle_sessions_one_crew_selection_check'
      AND conrelid = 'public.battle_sessions'::regclass
  ) THEN
    ALTER TABLE public.battle_sessions
      ADD CONSTRAINT battle_sessions_one_crew_selection_check
      CHECK (crew_selection_id IS NULL OR crew_selection_name IS NULL);
  END IF;
END $$;

COMMIT;
