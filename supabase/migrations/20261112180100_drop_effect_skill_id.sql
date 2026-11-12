-- Step 2 of 2: drop the single skill_id from effects that grant skills, now that
-- the app reads skill_ids (20261112180000). Apply AFTER the app that ships with
-- it is live. 'skills'-category effects keep skill_id: the skill they belong to.

UPDATE public.fighter_effect_types fet
SET type_specific_data = fet.type_specific_data - 'skill_id'
WHERE fet.type_specific_data ? 'skill_id'
  AND NOT EXISTS (
    SELECT 1 FROM public.fighter_effect_categories fec
    WHERE fec.id = fet.fighter_effect_category_id AND fec.category_name = 'skills'
  );

UPDATE public.fighter_effects fe
SET type_specific_data = fe.type_specific_data - 'skill_id'
FROM public.fighter_effect_types fet
WHERE fet.id = fe.fighter_effect_type_id
  AND fe.type_specific_data ? 'skill_id'
  AND NOT EXISTS (
    SELECT 1 FROM public.fighter_effect_categories fec
    WHERE fec.id = fet.fighter_effect_category_id AND fec.category_name = 'skills'
  );
