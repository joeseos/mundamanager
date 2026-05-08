UPDATE public.fighter_effect_types
SET
  type_specific_data = COALESCE(type_specific_data, '{}'::jsonb) || jsonb_build_object('killed', 'true'),
  updated_at = now()
WHERE effect_name IN ('Memorable Death', 'Critical Overload')
  AND fighter_effect_category_id IN (
    SELECT id
    FROM public.fighter_effect_categories
    WHERE category_name IN ('injuries', 'rig-glitches')
  );

UPDATE public.fighter_effects
SET
  type_specific_data = COALESCE(type_specific_data, '{}'::jsonb) || jsonb_build_object('killed', 'true'),
  updated_at = now()
WHERE effect_name IN ('Memorable Death', 'Critical Overload')
  AND fighter_effect_type_id IN (
    SELECT fet.id
    FROM public.fighter_effect_types fet
    JOIN public.fighter_effect_categories fec ON fec.id = fet.fighter_effect_category_id
    WHERE fet.effect_name IN ('Memorable Death', 'Critical Overload')
      AND fec.category_name IN ('injuries', 'rig-glitches')
  );
