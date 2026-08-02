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

-- 3. Seed the new fighter classes (Beast, Pet) against the N26 edition.
-- fighter_classes holds one row per class per edition, joined across editions
-- on slug, so these must be edition-scoped rather than NULL. The edition id is
-- resolved by slug because 20260730150000 seeds N26 with a generated uuid.
DO $$
DECLARE
  v_edition_id uuid;
BEGIN
  SELECT id INTO v_edition_id FROM public.editions WHERE slug = 'n26';

  IF v_edition_id IS NULL THEN
    RAISE EXCEPTION
      'N26 edition not found; 20260730150000_add_fighter_save_stat_and_n26.sql must run first';
  END IF;

  -- standard_class is deliberately not set: 20260402100000 drops the column, and
  -- where it still exists it defaults to false. Omitting it works in both cases.
  -- slug is still supplied only because the column is NOT NULL; it is matched on
  -- class_name, and the writes go away with the column (see section 6).
  INSERT INTO public.fighter_classes (class_name, slug, edition_id)
  SELECT v.class_name, v.slug, v_edition_id
  FROM (VALUES ('Beast', 'beast'), ('Pet', 'pet')) AS v(class_name, slug)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fighter_classes fc
    WHERE fc.class_name = v.class_name
      AND fc.edition_id = v_edition_id
  );
END $$;

-- 3b. Move the per-edition uniqueness guarantee from slug onto class_name.
-- fighter_classes.slug exists only as a cross-edition match key, but nothing in
-- the application reads it — fighters and fighter_types store class *names* in
-- their fighter_classes array, so the name is the real identity. Before slug can
-- be dropped, the uniqueness it enforced via fighter_classes_edition_slug_idx
-- has to live on class_name instead; otherwise nothing prevents two 'Leader'
-- rows in one edition, which would make resolving a class by name ambiguous.
--
-- This fails loudly if the target database already holds duplicate class names
-- within an edition; those have to be reconciled before it can be applied.
CREATE UNIQUE INDEX IF NOT EXISTS fighter_classes_edition_class_name_idx
  ON public.fighter_classes (edition_id, class_name)
  WHERE edition_id IS NOT NULL;

COMMENT ON TABLE public.fighter_classes IS
  'Fighter roles (Leader, Champion, Ganger, ...). The new edition rulebook calls these "Subtypes"; the display label is resolved per edition in app code. NOT related to fighter_sub_types. One row per class per edition, matched across editions on class_name.';

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

-- 6. Follow-up migration (after this is verified in preview) drops the columns
-- this one deliberately leaves in place:
--   fighters.fighter_class, fighters.fighter_class_id
--   fighter_types.fighter_class, fighter_types.fighter_class_id
--   custom_fighter_types.fighter_class, custom_fighter_types.fighter_class_id
--   fighter_ooa_records.causing_fighter_class, .injured_fighter_class
--   fighter_classes.slug, plus fighter_classes_slug_format_chk and
--     fighter_classes_edition_slug_idx (superseded by the class_name index
--     created in section 3b above)
-- Dropping fighter_classes.slug also lets the Beast/Pet inserts here and in
-- seed.sql stop supplying it — it is only passed today because it is NOT NULL.
