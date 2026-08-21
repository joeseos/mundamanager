-- Add the two status flags the N26 rig glitch rows were created without.
--
-- Runs after 20260814130000_fix_n26_rig_glitch_effect_names.sql and matches on
-- the corrected spellings ('Eternal Enmity', not 'Eternal Emnity').
--
-- 1. killed on Critical Overload (66)
--
-- 20260504163000_mark_fatal_effects_killed.sql already sets this for both
-- 'Memorable Death' and 'Critical Overload' across both categories, but it ran
-- in May and the N26 rig glitch rows were entered in August, so the N26 row
-- missed it. Same shape as that migration, including the fighter_effects
-- backfill: hasKilledStatusFlag reads the flag off instances too, and
-- fighter-injury-list uses it to decide whether clearing glitches should clear
-- the fighter's Killed status.
--
-- Written as the string 'true', not a JSON boolean, matching the existing rows.
-- hasKilledStatusFlag in utils/fighter-status.ts accepts either.
--
-- 2. hatred_target on the Enmity trio (12, 13, 14)
--
-- Same fix 20260806170000_add_hatred_target_to_enmity_injuries.sql applied to
-- the lasting injury rows, which likewise predates these. Without the key
-- requiredHatredTarget returns null and the target picker never renders, so the
-- Hatred (X) target goes unrecorded. add_fighter_injury.sql reads the same key
-- and already handles all three kinds, so nothing else needs to change.
--
-- Values must match HatredTargetKind in utils/injuryTarget.ts, and the mapping
-- is the same as the N26 lasting injuries: Eternal = the gang TYPE that took
-- them Out of Action, Bitter = the GANG, Personal = the MODEL.
--
-- Re-runnable: `||` overwrites with the same value.

BEGIN;

-- 1. Critical Overload kills the fighter outright.
WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'rig-glitches') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
), updated_types AS (
  UPDATE public.fighter_effect_types fet
  SET type_specific_data =
        COALESCE(fet.type_specific_data, '{}'::jsonb) || jsonb_build_object('killed', 'true'),
      updated_at = now()
  FROM target t
  WHERE fet.effect_name = 'Critical Overload'
    AND fet.fighter_effect_category_id = t.category_id
    AND fet.edition_id = t.edition_id
  RETURNING fet.id
)
UPDATE public.fighter_effects fe
SET type_specific_data =
      COALESCE(fe.type_specific_data, '{}'::jsonb) || jsonb_build_object('killed', 'true'),
    updated_at = now()
FROM updated_types u
WHERE fe.fighter_effect_type_id = u.id;

-- 2. Each Enmity result declares which kind of Hatred (X) target it needs.
WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'rig-glitches') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
),
assignments(effect_name, hatred_target) AS (
  VALUES
    ('Eternal Enmity',  'gang_type'),
    ('Bitter Enmity',   'gang'),
    ('Personal Enmity', 'fighter')
)
UPDATE public.fighter_effect_types fet
SET type_specific_data =
      COALESCE(fet.type_specific_data, '{}'::jsonb)
      || jsonb_build_object('hatred_target', a.hatred_target),
    updated_at = now()
FROM assignments a
CROSS JOIN target t
WHERE fet.effect_name = a.effect_name
  AND fet.fighter_effect_category_id = t.category_id
  AND fet.edition_id = t.edition_id;

COMMIT;
