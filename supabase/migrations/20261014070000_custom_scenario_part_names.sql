BEGIN;

-- ============================================================================
-- CUSTOM N26 DEPLOYMENT AND OBJECTIVE NAMES IN THEIR OWN COLUMNS
-- A custom Deployment or Objective was kept in the battle's scenario text as
-- "Deployment / Objective" (the other side its entry's name), and a lone typed
-- Deployment as the text alone. An N26 battle can now also be given a scenario
-- name, which takes the scenario text, so a custom Deployment and Objective
-- move beside their ids, as a custom Crew already is (crew_selection_name).
--
-- 1. campaign_battles and battle_sessions get deployment_name and
--    objective_name, each held to one of it or its id.
-- 2. N26 battle logs and sessions have their scenario text read as the app
--    read it until now: the typed names move to the new columns and the text
--    is cleared, as no N26 battle had a scenario name before this. Text beside
--    two picked entries only repeated an entry's name, and goes too.
--
-- Step 2 reads every N26 scenario text as typed parts, so run this once,
-- just before the app code that reads the columns deploys: battle logs and
-- sessions select and save them by name, and an N26 scenario saved after
-- this by the old code would be read as a scenario name.
-- ============================================================================

-- 1. The columns
ALTER TABLE public.campaign_battles
    ADD COLUMN IF NOT EXISTS deployment_name text,
    ADD COLUMN IF NOT EXISTS objective_name text;

COMMENT ON COLUMN public.campaign_battles.deployment_name IS
    'N26 custom Deployment named by hand instead of rolled. NULL while '
    'deployment_id is set.';
COMMENT ON COLUMN public.campaign_battles.objective_name IS
    'N26 custom Objective named by hand instead of rolled. NULL while '
    'objective_id is set.';

ALTER TABLE public.battle_sessions
    ADD COLUMN IF NOT EXISTS deployment_name text,
    ADD COLUMN IF NOT EXISTS objective_name text;

COMMENT ON COLUMN public.battle_sessions.deployment_name IS
    'N26 custom Deployment named by hand instead of rolled. NULL while '
    'deployment_id is set. Copied into campaign_battles on completion.';
COMMENT ON COLUMN public.battle_sessions.objective_name IS
    'N26 custom Objective named by hand instead of rolled. NULL while '
    'objective_id is set. Copied into campaign_battles on completion.';

DO $$
DECLARE
  t text;
  part text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campaign_battles', 'battle_sessions'] LOOP
    FOREACH part IN ARRAY ARRAY['deployment', 'objective'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = format('%s_one_%s_check', t, part)
          AND conrelid = format('public.%I', t)::regclass
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I IS NULL)',
          t, format('%s_one_%s_check', t, part), part || '_id', part || '_name'
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 2. Typed names out of the N26 scenario text.
-- The text was "Deployment / Objective", each side typed or its entry's name
-- (which may hold " / "; a typed name has no "/"), or a typed Deployment alone.
CREATE FUNCTION pg_temp.typed_scenario_parts(
  scenario text, has_deployment boolean, has_objective boolean,
  OUT deployment_name text, OUT objective_name text
) LANGUAGE sql IMMUTABLE AS $f$
  SELECT
    CASE
      WHEN has_deployment THEN NULL
      WHEN strpos(scenario, ' / ') = 0 THEN CASE WHEN NOT has_objective THEN nullif(btrim(scenario), '') END
      ELSE nullif(btrim(left(scenario, strpos(scenario, ' / ') - 1)), '')
    END,
    CASE
      WHEN has_objective OR strpos(scenario, ' / ') = 0 THEN NULL
      -- After the last separator when the Deployment is an entry, whose name may hold one.
      WHEN has_deployment THEN nullif(btrim(right(scenario, strpos(reverse(scenario), ' / ') - 1)), '')
      ELSE nullif(btrim(substr(scenario, strpos(scenario, ' / ') + 3)), '')
    END
$f$;

UPDATE public.campaign_battles cb
SET deployment_name = p.deployment_name,
    objective_name = p.objective_name,
    scenario = NULL
FROM (
  SELECT b.id, parts.*
  FROM public.campaign_battles b
  JOIN public.campaigns c ON c.id = b.campaign_id
  JOIN public.campaign_types ct ON ct.id = c.campaign_type_id
  JOIN public.editions ed ON ed.id = ct.edition_id AND ed.slug = 'n26'
  CROSS JOIN LATERAL pg_temp.typed_scenario_parts(b.scenario, b.deployment_id IS NOT NULL, b.objective_id IS NOT NULL) parts
  WHERE b.scenario IS NOT NULL
) p
WHERE p.id = cb.id;

UPDATE public.battle_sessions bs
SET deployment_name = p.deployment_name,
    objective_name = p.objective_name,
    scenario = NULL
FROM (
  SELECT s.id, parts.*
  FROM public.battle_sessions s
  JOIN public.editions ed ON ed.id = s.edition_id AND ed.slug = 'n26'
  CROSS JOIN LATERAL pg_temp.typed_scenario_parts(s.scenario, s.deployment_id IS NOT NULL, s.objective_id IS NOT NULL) parts
  WHERE s.scenario IS NOT NULL
) p
WHERE p.id = bs.id;

COMMIT;
