-- Phase 2: remove the single-value fighter class columns.
--
-- 20260801120000 added fighter_classes jsonb, backfilled it, and moved all
-- application code onto the array. The old columns stayed behind so a rollback
-- remained possible while the new frontend rolled out. That window has closed.
--
-- This migration deletes no rows. It contains only guards, DROP FUNCTION,
-- DROP COLUMN, DROP INDEX/CONSTRAINT and COMMENT statements, and deliberately
-- uses no CASCADE anywhere: plain DROP (RESTRICT) means that if anything
-- unexpectedly depends on one of these columns, the statement fails loudly
-- rather than quietly removing the dependent object too.

-- 1. Refuse to drop anything if it would destroy the only copy of a class.
-- A row is at risk when a legacy column still holds a value but the Phase 1
-- backfill left fighter_classes empty.
-- The checks run through dynamic SQL behind a column-existence test so that
-- re-running this migration after the columns are gone is a no-op rather than a
-- "column does not exist" error.
DO $$
DECLARE
  t        text;
  v_n      bigint;
  v_total  bigint := 0;
  v_detail text   := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['fighters', 'fighter_types', 'custom_fighter_types'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'fighter_class'
    ) THEN
      EXECUTE format(
        'SELECT count(*) FROM public.%I
          WHERE fighter_classes = ''[]''::jsonb
            AND (fighter_class IS NOT NULL OR fighter_class_id IS NOT NULL)', t
      ) INTO v_n;

      IF v_n > 0 THEN
        v_total  := v_total + v_n;
        v_detail := v_detail || format('%s: %s; ', t, v_n);
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fighter_ooa_records'
      AND column_name = 'causing_fighter_class'
  ) THEN
    EXECUTE
      'SELECT count(*) FROM public.fighter_ooa_records
        WHERE (causing_fighter_classes = ''[]''::jsonb AND causing_fighter_class IS NOT NULL)
           OR (injured_fighter_classes = ''[]''::jsonb AND injured_fighter_class IS NOT NULL)'
      INTO v_n;

    IF v_n > 0 THEN
      v_total  := v_total + v_n;
      v_detail := v_detail || format('fighter_ooa_records: %s; ', v_n);
    END IF;
  END IF;

  IF v_total > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop legacy class columns: % row(s) hold a class only in the old columns (%). Re-run the 20260801120000 backfill first.',
      v_total, v_detail;
  END IF;
END $$;

-- 2. Drop the orphaned pre-JSONB function. It is not tracked in
-- supabase/functions/, has no callers (get_fighter_types_with_cost supersedes
-- it), and INNER JOINs fighter_classes on ft.fighter_class_id — so it would be
-- permanently broken by the drops below. Recoverable from the schema snapshot.
DROP FUNCTION IF EXISTS public.get_add_fighter_details(uuid, uuid);

-- 3. Drop the legacy class columns.
-- Each column's own index and FK go with it; that is not a cascade and removes
-- no rows. Note skill_access_archetypes.fighter_class_id is deliberately NOT
-- touched: it is a real FK to the fighter_classes table, used by archetypes.
ALTER TABLE public.fighters
  DROP COLUMN IF EXISTS fighter_class,
  DROP COLUMN IF EXISTS fighter_class_id;

ALTER TABLE public.fighter_types
  DROP COLUMN IF EXISTS fighter_class,
  DROP COLUMN IF EXISTS fighter_class_id;

ALTER TABLE public.custom_fighter_types
  DROP COLUMN IF EXISTS fighter_class,
  DROP COLUMN IF EXISTS fighter_class_id;

ALTER TABLE public.fighter_ooa_records
  DROP COLUMN IF EXISTS causing_fighter_class,
  DROP COLUMN IF EXISTS injured_fighter_class;

-- 4. Drop fighter_classes.slug and the objects that exist only for it.
-- Nothing ever read slug. Its one real job — one row per class per edition —
-- moved to fighter_classes_edition_class_name_idx in 20260801120000.
DROP INDEX IF EXISTS public.fighter_classes_edition_slug_idx;

ALTER TABLE public.fighter_classes
  DROP CONSTRAINT IF EXISTS fighter_classes_slug_format_chk;

ALTER TABLE public.fighter_classes
  DROP COLUMN IF EXISTS slug;

-- 5. Record where class identity lives now. The old slug column comment said to
-- match on slug and never on class_name; that column is gone and the advice is
-- inverted.
COMMENT ON TABLE public.fighter_classes IS
  'Fighter roles (Leader, Champion, Ganger, ...). The new edition rulebook calls these "Subtypes"; the display label is resolved per edition in app code. NOT related to fighter_sub_types. One row per class per edition, matched across editions on class_name.';

COMMENT ON COLUMN public.fighter_classes.class_name IS
  'Class identity. Unique per edition (fighter_classes_edition_class_name_idx) and the value stored in fighters/fighter_types.fighter_classes; match on this across editions.';
