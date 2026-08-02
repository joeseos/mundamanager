-- Migration: Add fighter_classes JSONB columns to support multiple classes per fighter
-- Phase 1: Adds new columns alongside the existing single-value columns for rollback
-- safety. Code reads and writes only the new columns. The old columns
-- (fighter_class, fighter_class_id, causing_fighter_class, injured_fighter_class)
-- are NOT dropped yet — they will be removed in a follow-up migration after testing.

-- 1. Add fighter_classes JSONB column to three tables
ALTER TABLE public.fighter_types
  ADD COLUMN IF NOT EXISTS fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.custom_fighter_types
  ADD COLUMN IF NOT EXISTS fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Populate the new column. All three tables carry both legacy columns
-- (fighter_class text and fighter_class_id uuid), and neither is guaranteed
-- populated, so each table gets two passes: its primary source first, then the
-- other column as a fallback. Every pass is guarded on fighter_classes = '[]',
-- so a later pass only fills what an earlier one missed and re-running is safe.

-- fighter_types: the FK is primary here, because get_fighter_types_with_cost
-- resolved the displayed class name through it.
UPDATE public.fighter_types ft
SET fighter_classes = jsonb_build_array(fc.class_name)
FROM public.fighter_classes fc
WHERE fc.id = ft.fighter_class_id
  AND ft.fighter_classes = '[]'::jsonb;

-- Fall back to the text column. That RPC used to INNER JOIN fighter_classes,
-- which hid rows with a NULL/unresolvable fighter_class_id; the join has been
-- removed, so these rows now surface and must carry a class.
UPDATE public.fighter_types
SET fighter_classes = jsonb_build_array(fighter_class)
WHERE fighter_class IS NOT NULL
  AND fighter_class != ''
  AND fighter_classes = '[]'::jsonb;

-- fighters: the text column is primary, since that is what the app read and
-- displayed for a fighter.
UPDATE public.fighters
SET fighter_classes = jsonb_build_array(fighter_class)
WHERE fighter_class IS NOT NULL
  AND fighter_class != ''
  AND fighter_classes = '[]'::jsonb;

UPDATE public.fighters f
SET fighter_classes = jsonb_build_array(fc.class_name)
FROM public.fighter_classes fc
WHERE fc.id = f.fighter_class_id
  AND f.fighter_classes = '[]'::jsonb;

-- custom_fighter_types: same shape as fighters.
UPDATE public.custom_fighter_types
SET fighter_classes = jsonb_build_array(fighter_class)
WHERE fighter_class IS NOT NULL
  AND fighter_class != ''
  AND fighter_classes = '[]'::jsonb;

UPDATE public.custom_fighter_types cft
SET fighter_classes = jsonb_build_array(fc.class_name)
FROM public.fighter_classes fc
WHERE fc.id = cft.fighter_class_id
  AND cft.fighter_classes = '[]'::jsonb;

-- 3. Seed new fighter classes (Beast, Pet) for the new edition
INSERT INTO public.fighter_classes (class_name, slug, standard_class)
SELECT 'Beast', 'beast', false
WHERE NOT EXISTS (SELECT 1 FROM public.fighter_classes WHERE slug = 'beast');

INSERT INTO public.fighter_classes (class_name, slug, standard_class)
SELECT 'Pet', 'pet', false
WHERE NOT EXISTS (SELECT 1 FROM public.fighter_classes WHERE slug = 'pet');

-- 4. Add fighter_classes JSONB columns to fighter_ooa_records (class snapshots
-- recorded at the time a fighter went out of action)
ALTER TABLE public.fighter_ooa_records
  ADD COLUMN IF NOT EXISTS causing_fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS injured_fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.fighter_ooa_records
SET causing_fighter_classes = jsonb_build_array(causing_fighter_class)
WHERE causing_fighter_class IS NOT NULL
  AND causing_fighter_class != ''
  AND causing_fighter_classes = '[]'::jsonb;

UPDATE public.fighter_ooa_records
SET injured_fighter_classes = jsonb_build_array(injured_fighter_class)
WHERE injured_fighter_class IS NOT NULL
  AND injured_fighter_class != ''
  AND injured_fighter_classes = '[]'::jsonb;

-- 5. SQL functions are NOT updated here. They live in supabase/functions/ and
-- are deployed by .github/workflows/deploy_supabase_functions.yml on push to
-- main. This migration must be applied BEFORE that runs, since the updated
-- RPCs read the fighter_classes column added above.
-- RPCs that read fighter_classes:
--   get_available_skills
--   get_fighter_available_advancements
--   get_fighter_types_with_cost
--   get_gang_details
--   copy_custom_collection
