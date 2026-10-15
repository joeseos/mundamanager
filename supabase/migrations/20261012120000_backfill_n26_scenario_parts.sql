BEGIN;

-- ============================================================================
-- N26 SCENARIO TEXT TO SCENARIO PARTS
-- Before the scenario tables, an N26 battle's scenario was text: mostly one of
-- six `scenarios` rows that were really the Deployment table, sometimes an
-- Objective typed in. Battle sessions also did not copy a challenge's
-- Deployment, Objective, Crew or Side Jobs.
--
-- 1. Open sessions played from a challenge take the challenge's parts and
--    Side Jobs, so completing them files what the challenge recorded.
-- 2. Battle logs and sessions whose scenario text names a core Deployment, or
--    else a core Objective, get its id (ignoring case and outer spaces). The
--    text is kept as the original record.
-- 3. The six N26 `scenarios` rows are removed.
--
-- Only rows with no parts (or Side Job) yet are touched, so running this
-- again changes nothing. Apply it after the code that writes the parts is
-- deployed: until then, sessions still write the text and do not copy a
-- challenge's parts, and the old New Battle modal rolls on the six rows.
-- ============================================================================

-- 1. Open sessions take their challenge's parts and Side Jobs
UPDATE public.battle_sessions bs
SET deployment_id = cb.deployment_id,
    objective_id = cb.objective_id,
    crew_selection_id = cb.crew_selection_id
FROM public.campaign_battles cb
WHERE cb.id = bs.campaign_battle_id
  AND bs.status <> 'completed'
  AND bs.deployment_id IS NULL
  AND bs.objective_id IS NULL
  AND bs.crew_selection_id IS NULL
  AND (cb.deployment_id IS NOT NULL OR cb.objective_id IS NOT NULL OR cb.crew_selection_id IS NOT NULL);

-- participants is stored as a JSON string or an array; #>> '{}' reads both.
UPDATE public.battle_session_participants bsp
SET side_job_id = (gang ->> 'side_job_id')::uuid
FROM public.battle_sessions bs
JOIN public.campaign_battles cb ON cb.id = bs.campaign_battle_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof((cb.participants #>> '{}')::jsonb) = 'array'
       THEN (cb.participants #>> '{}')::jsonb
       ELSE '[]'::jsonb
  END
) AS gang
WHERE bsp.battle_session_id = bs.id
  AND bs.status <> 'completed'
  AND bsp.side_job_id IS NULL
  AND bsp.gang_id::text = gang ->> 'gang_id'
  AND gang ->> 'side_job_id' IS NOT NULL
  -- No foreign key covers the JSON, so skip a Side Job that has since been deleted.
  AND EXISTS (
    SELECT 1 FROM public.scenario_table_entries e
    WHERE e.id::text = gang ->> 'side_job_id'
  );

-- 2. Scenario text naming a core Deployment, then a core Objective
UPDATE public.campaign_battles cb
SET deployment_id = e.id
FROM public.campaigns c
JOIN public.campaign_types ct ON ct.id = c.campaign_type_id
JOIN public.editions ed ON ed.id = ct.edition_id AND ed.slug = 'n26'
JOIN public.scenario_tables t ON t.edition_id = ed.id AND t.gang_type_id IS NULL AND t.table_type = 'deployment'
JOIN public.scenario_table_entries e ON e.scenario_table_id = t.id
WHERE c.id = cb.campaign_id
  AND lower(btrim(e.name)) = lower(btrim(cb.scenario))
  AND cb.deployment_id IS NULL
  AND cb.objective_id IS NULL;

UPDATE public.campaign_battles cb
SET objective_id = e.id
FROM public.campaigns c
JOIN public.campaign_types ct ON ct.id = c.campaign_type_id
JOIN public.editions ed ON ed.id = ct.edition_id AND ed.slug = 'n26'
JOIN public.scenario_tables t ON t.edition_id = ed.id AND t.gang_type_id IS NULL AND t.table_type = 'objective'
JOIN public.scenario_table_entries e ON e.scenario_table_id = t.id
WHERE c.id = cb.campaign_id
  AND lower(btrim(e.name)) = lower(btrim(cb.scenario))
  AND cb.deployment_id IS NULL
  AND cb.objective_id IS NULL;

UPDATE public.battle_sessions bs
SET deployment_id = e.id
FROM public.editions ed
JOIN public.scenario_tables t ON t.edition_id = ed.id AND t.gang_type_id IS NULL AND t.table_type = 'deployment'
JOIN public.scenario_table_entries e ON e.scenario_table_id = t.id
WHERE ed.id = bs.edition_id
  AND ed.slug = 'n26'
  AND lower(btrim(e.name)) = lower(btrim(bs.scenario))
  AND bs.deployment_id IS NULL
  AND bs.objective_id IS NULL;

UPDATE public.battle_sessions bs
SET objective_id = e.id
FROM public.editions ed
JOIN public.scenario_tables t ON t.edition_id = ed.id AND t.gang_type_id IS NULL AND t.table_type = 'objective'
JOIN public.scenario_table_entries e ON e.scenario_table_id = t.id
WHERE ed.id = bs.edition_id
  AND ed.slug = 'n26'
  AND lower(btrim(e.name)) = lower(btrim(bs.scenario))
  AND bs.deployment_id IS NULL
  AND bs.objective_id IS NULL;

-- 3. N26 battles now pick from the scenario tables, and nothing references
-- these rows (campaign_battles.scenario_id has no foreign key, and no N26
-- battle sets it).
DELETE FROM public.scenarios s
USING public.editions ed
WHERE ed.id = s.edition_id
  AND ed.slug = 'n26';

COMMIT;
