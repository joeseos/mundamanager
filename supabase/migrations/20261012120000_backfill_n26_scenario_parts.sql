BEGIN;

-- ============================================================================
-- N26 SCENARIO TEXT TO SCENARIO PARTS
-- Before the scenario tables, an N26 battle's scenario was text: mostly one of
-- six `scenarios` rows that were really the Deployment table, sometimes an
-- Objective typed in. This fills deployment_id or objective_id on N26 battle
-- logs and battle sessions whose scenario text names a core table entry,
-- ignoring case and outer spaces. The text is kept as the original record.
--
-- Only rows with neither part yet are touched, so running this again changes
-- nothing. Apply it after the code that writes the parts is deployed: until
-- then, battle sessions still write the text, and the old session modal rolls
-- on the six `scenarios` rows removed at the end.
-- ============================================================================

UPDATE public.campaign_battles cb
SET deployment_id = CASE WHEN entry.table_type = 'deployment' THEN entry.id END,
    objective_id  = CASE WHEN entry.table_type = 'objective'  THEN entry.id END
FROM public.campaigns c
JOIN public.campaign_types ct ON ct.id = c.campaign_type_id
JOIN public.editions ed ON ed.id = ct.edition_id AND ed.slug = 'n26'
JOIN (
  SELECT e.id, e.edition_id, t.table_type, lower(btrim(e.name)) AS name_key
  FROM public.scenario_table_entries e
  JOIN public.scenario_tables t ON t.id = e.scenario_table_id
  WHERE t.gang_type_id IS NULL AND t.table_type IN ('deployment', 'objective')
) entry ON entry.edition_id = ed.id
WHERE c.id = cb.campaign_id
  AND entry.name_key = lower(btrim(cb.scenario))
  AND cb.deployment_id IS NULL
  AND cb.objective_id IS NULL;

UPDATE public.battle_sessions bs
SET deployment_id = CASE WHEN entry.table_type = 'deployment' THEN entry.id END,
    objective_id  = CASE WHEN entry.table_type = 'objective'  THEN entry.id END
FROM public.editions ed
JOIN (
  SELECT e.id, e.edition_id, t.table_type, lower(btrim(e.name)) AS name_key
  FROM public.scenario_table_entries e
  JOIN public.scenario_tables t ON t.id = e.scenario_table_id
  WHERE t.gang_type_id IS NULL AND t.table_type IN ('deployment', 'objective')
) entry ON entry.edition_id = ed.id
WHERE ed.id = bs.edition_id
  AND ed.slug = 'n26'
  AND entry.name_key = lower(btrim(bs.scenario))
  AND bs.deployment_id IS NULL
  AND bs.objective_id IS NULL;

-- N26 battles now pick from the scenario tables, and nothing references these
-- rows (campaign_battles.scenario_id has no foreign key, and no N26 battle
-- sets it).
DELETE FROM public.scenarios s
USING public.editions ed
WHERE ed.id = s.edition_id
  AND ed.slug = 'n26';

COMMIT;
