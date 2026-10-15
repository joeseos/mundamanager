BEGIN;

-- ============================================================================
-- CUSTOM N26 SIDE JOBS
-- A gang's Side Job may be named by hand instead of rolled, as a battle's
-- Deployment or Objective may. A custom Side Job has no entry, so its name is
-- kept beside side_job_id, and a gang has one or the other.
--
-- A battle log keeps it in its participants JSON as side_job_name, which needs
-- no column. A battle session keeps it here, and copies it there on completion.
--
-- Apply before the app code that reads it deploys: sessions save and copy the
-- column by name.
-- ============================================================================

ALTER TABLE public.battle_session_participants
    ADD COLUMN IF NOT EXISTS side_job_name text;

COMMENT ON COLUMN public.battle_session_participants.side_job_name IS
    'N26 custom Side Job this gang named by hand instead of rolling one. NULL '
    'while side_job_id is set. Copied into campaign_battles.participants on '
    'completion.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'battle_session_participants_one_side_job_check'
      AND conrelid = 'public.battle_session_participants'::regclass
  ) THEN
    ALTER TABLE public.battle_session_participants
      ADD CONSTRAINT battle_session_participants_one_side_job_check
      CHECK (side_job_id IS NULL OR side_job_name IS NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.campaign_battles.participants IS
    'One object per gang: gang_id and role (attacker, defender or none: a '
    'scenario role), with optional is_winner and claimed_territory, and on n26 '
    'optional side_job_id (a scenario_table_entries row of a side_job table) or '
    'side_job_name (a custom Side Job), and side_job_completed.';

COMMIT;
