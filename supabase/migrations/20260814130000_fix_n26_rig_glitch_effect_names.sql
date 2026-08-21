-- Correct four misspelled N26 rig glitch effect names.
--
-- The D66 range shown against a rig glitch, and the row a roll resolves to, are
-- both a name-keyed lookup between RIG_GLITCH_TABLE_N26 in utils/dice.ts and
-- fighter_effect_types.effect_name. Four of the twenty N26 rows were entered
-- through Admin -> Injuries with names that do not match the rulebook, so a
-- roll of 11-14 resolved to nothing and left the combobox on its placeholder:
--
--     Lesson Learned  -> Lesson Learnt     (11, the N23 spelling carried over)
--     Eternal Emnity  -> Eternal Enmity    (12, 'nm' transposed)
--     Bitter Emnity   -> Bitter Enmity     (13, 'nm' transposed)
--     Personal Emnity -> Personal Enmity   (14, 'nm' transposed)
--
-- 'Bitter Enmity' additionally has to match BITTER_ENMITY_EFFECT_NAME in
-- utils/injuryTarget.ts, which LASTING_INJURY_TABLE_N26 and
-- VEHICLE_DAMAGE_TABLE_N26 already key on.
--
-- Scoped to edition n26 AND the rig-glitches category, both of which matter:
-- the N23 rig glitch table has its own 'Lesson Learned' at 11 and the N26
-- lasting injury and vehicle damage tables have their own Enmity trio. Those
-- are separate rows and are correct as they stand.
--
-- Renaming rather than re-seeding keeps the ids, so fighter_effects rows
-- already pointing at these four types stay attached.
--
-- Re-runnable: each update is a no-op once applied, and is skipped outright if
-- a correctly named row somehow already exists alongside the misspelled one
-- (fighter_effect_types has no unique constraint on the name).

BEGIN;

WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'rig-glitches') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
),
renames(old_name, new_name) AS (
  VALUES
    ('Lesson Learned',  'Lesson Learnt'),
    ('Eternal Emnity',  'Eternal Enmity'),
    ('Bitter Emnity',   'Bitter Enmity'),
    ('Personal Emnity', 'Personal Enmity')
)
UPDATE public.fighter_effect_types fet
SET effect_name = r.new_name,
    updated_at = now()
FROM renames r, target t
WHERE fet.effect_name = r.old_name
  AND fet.fighter_effect_category_id = t.category_id
  AND fet.edition_id = t.edition_id
  AND NOT EXISTS (
    SELECT 1 FROM public.fighter_effect_types existing
    WHERE existing.effect_name = r.new_name
      AND existing.fighter_effect_category_id = t.category_id
      AND existing.edition_id = t.edition_id
  );

COMMIT;
