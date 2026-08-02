-- Migration: Add fighter_classes JSONB column to support multiple classes per fighter
-- Phase 1: Adds new column alongside existing fighter_class/fighter_class_id for rollback safety

-- 1. Add fighter_classes JSONB column to three tables
ALTER TABLE public.fighter_types
  ADD COLUMN IF NOT EXISTS fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.custom_fighter_types
  ADD COLUMN IF NOT EXISTS fighter_classes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Populate fighter_types from the canonical fighter_classes table
UPDATE public.fighter_types ft
SET fighter_classes = jsonb_build_array(fc.class_name)
FROM public.fighter_classes fc
WHERE fc.id = ft.fighter_class_id
  AND ft.fighter_classes = '[]'::jsonb;

-- Populate fighters from their existing fighter_class text column
UPDATE public.fighters
SET fighter_classes = jsonb_build_array(fighter_class)
WHERE fighter_class IS NOT NULL
  AND fighter_class != ''
  AND fighter_classes = '[]'::jsonb;

-- Populate custom_fighter_types from their existing fighter_class text column
UPDATE public.custom_fighter_types
SET fighter_classes = jsonb_build_array(fighter_class)
WHERE fighter_class IS NOT NULL
  AND fighter_class != ''
  AND fighter_classes = '[]'::jsonb;

-- 3. Seed new fighter classes (Beast, Pet) for the new edition
INSERT INTO public.fighter_classes (class_name, slug, standard_class)
SELECT 'Beast', 'beast', false
WHERE NOT EXISTS (SELECT 1 FROM public.fighter_classes WHERE slug = 'beast');

INSERT INTO public.fighter_classes (class_name, slug, standard_class)
SELECT 'Pet', 'pet', false
WHERE NOT EXISTS (SELECT 1 FROM public.fighter_classes WHERE slug = 'pet');

-- 4. SQL functions are NOT updated here.
-- The following RPCs read fighter_classes and are maintained in supabase/functions/,
-- to be applied manually:
--   get_available_skills
--   get_fighter_available_advancements
--   get_fighter_types_with_cost
--   get_gang_details
--   copy_custom_collection
