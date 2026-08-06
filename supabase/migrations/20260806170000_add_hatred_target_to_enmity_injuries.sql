-- Declare which kind of Hatred (X) target each Enmity injury needs, so neither
-- the client nor the RPC has to hardcode injury names. Replaces the
-- `effect_name <> 'Bitter Enmity'` check in add_fighter_injury.sql.
--
-- N23's Bitter Enmity is included so the one existing targeted injury runs
-- through the same path as the new ones — no legacy branch.
--
-- Values must match HatredTargetKind in utils/injuryTarget.ts.
-- Re-runnable: `||` overwrites with the same value.

BEGIN;

WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'injuries') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n23') AS n23_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS n26_id
),
assignments(effect_name, edition_slug, hatred_target) AS (
  VALUES
    ('Bitter Enmity',   'n23', 'gang'),
    ('Bitter Enmity',   'n26', 'gang'),
    ('Eternal Enmity',  'n26', 'gang_type'),
    ('Personal Enmity', 'n26', 'fighter')
)
UPDATE public.fighter_effect_types fet
SET type_specific_data =
      COALESCE(fet.type_specific_data, '{}'::jsonb)
      || jsonb_build_object('hatred_target', a.hatred_target)
FROM assignments a
CROSS JOIN target t
WHERE fet.effect_name = a.effect_name
  AND fet.fighter_effect_category_id = t.category_id
  AND fet.edition_id = CASE a.edition_slug WHEN 'n23' THEN t.n23_id ELSE t.n26_id END;

COMMIT;
