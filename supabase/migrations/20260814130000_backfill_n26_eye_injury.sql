-- Backfill the N26 'Eye Injury' lasting injury.
--
-- 20260806160000_seed_n26_lasting_injuries.sql lists all 17 N26 injuries, but
-- the catalog ended up with 16: every row except 51 Eye Injury exists for the
-- n26 edition. Without the row the injury cannot be picked in the injury modal
-- and a D66 roll of 51 resolves to a name with nothing behind it, even though
-- LASTING_INJURY_TABLE_N26 in utils/dice.ts has always listed it.
--
-- Nothing in the app code needs changing — the D66 range, the reverse name
-- lookup and the (absent) N26 rank map are already correct. This is a data gap.
--
-- The modifier is seeded here rather than entered through Admin -> Injuries so
-- the row cannot land half-finished a second time. type_specific_data mirrors
-- the other five N26 characteristic injuries exactly, `effect_selection` and
-- all, so the admin UI shows this row the same way as its neighbours.
--
-- SIGN CONVENTION — 'reduce BS by 1' is +1, because BS stays a target number on
-- N26 (2+…6+), so a worse BS is a HIGHER number. Same as the N23 Eye Injury and
-- as N26 Hand Injury / Busted Sights. See N26_FIGHTER_LIMITS in
-- utils/characteristicLimits.ts.
--
-- Re-runnable: both inserts are guarded, and the second half joins the effect
-- type back by (effect_name, category, edition) so it stands alone if the first
-- half was a no-op.

BEGIN;

WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'injuries') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
)
INSERT INTO public.fighter_effect_types (effect_name, fighter_effect_category_id, edition_id, type_specific_data)
SELECT
  'Eye Injury',
  t.category_id,
  t.edition_id,
  '{"recovery": "true", "convalescence": "false", "effect_selection": "fixed"}'::jsonb
FROM target t
WHERE t.category_id IS NOT NULL
  AND t.edition_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.fighter_effect_types existing
    WHERE existing.effect_name = 'Eye Injury'
      AND existing.fighter_effect_category_id = t.category_id
      AND existing.edition_id = t.edition_id
  );

-- 51 — 'reduces its Ballistic Skill characteristic by 1'. operation 'add' is
-- explicit to match the N26 injury modifiers entered through Admin -> Injuries;
-- applyModifiers defaults a null operation to 'add' anyway.
WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'injuries') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
)
INSERT INTO public.fighter_effect_type_modifiers (fighter_effect_type_id, stat_name, default_numeric_value, operation)
SELECT fet.id, 'ballistic_skill', 1, 'add'
FROM target t
JOIN public.fighter_effect_types fet
  ON fet.effect_name = 'Eye Injury'
 AND fet.fighter_effect_category_id = t.category_id
 AND fet.edition_id = t.edition_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.fighter_effect_type_modifiers existing
  WHERE existing.fighter_effect_type_id = fet.id
    AND existing.stat_name = 'ballistic_skill'
);

COMMIT;
