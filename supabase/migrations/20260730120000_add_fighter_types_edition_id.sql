-- fighter_types gets a real edition_id even though it is derivable via
-- gang_type_id; the composite FK below prevents the two from drifting apart.
-- The value is always derived server-side from the chosen gang type, never
-- accepted from clients.

-- 1. FK target: unique over (gang_type_id, edition_id). gang_type_id alone is
--    already unique so this adds no new restriction; a nullable edition_id is a
--    valid FK target (MATCH SIMPLE skips NULL rows on the referencing side).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gang_types_gang_type_id_edition_id_key'
      AND conrelid = 'public.gang_types'::regclass
  ) THEN
    ALTER TABLE public.gang_types
      ADD CONSTRAINT gang_types_gang_type_id_edition_id_key
      UNIQUE (gang_type_id, edition_id);
  END IF;
END $$;

-- 2. Column + direct editions FK + index, mirroring the other root tables.
ALTER TABLE public.fighter_types
  ADD COLUMN IF NOT EXISTS edition_id uuid
    REFERENCES public.editions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS fighter_types_edition_id_idx
  ON public.fighter_types (edition_id);

-- 3. Backfill from the parent gang type BEFORE adding the composite FK.
UPDATE public.fighter_types ft
SET edition_id = gt.edition_id
FROM public.gang_types gt
WHERE gt.gang_type_id = ft.gang_type_id
  AND ft.edition_id IS NULL;

-- 4. Composite FK: whenever fighter_types.edition_id is set, it must equal the
--    parent gang type's edition. ON UPDATE CASCADE keeps children in sync if a
--    gang type is ever moved to another edition. Rows whose edition_id is still
--    NULL stay unenforced (MATCH SIMPLE) until the column goes NOT NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fighter_types_gang_type_edition_fkey'
      AND conrelid = 'public.fighter_types'::regclass
  ) THEN
    ALTER TABLE public.fighter_types
      ADD CONSTRAINT fighter_types_gang_type_edition_fkey
      FOREIGN KEY (gang_type_id, edition_id)
      REFERENCES public.gang_types (gang_type_id, edition_id)
      ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN public.fighter_types.edition_id IS
  'Denormalized from gang_types via the composite FK on (gang_type_id, edition_id); derived server-side from the chosen gang type, never accepted from clients.';
