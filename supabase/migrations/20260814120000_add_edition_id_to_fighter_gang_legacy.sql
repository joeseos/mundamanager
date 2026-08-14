-- Mirror the edition_id column gang_affiliation already carries.
ALTER TABLE public.fighter_gang_legacy
  ADD COLUMN IF NOT EXISTS edition_id uuid
    REFERENCES public.editions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS fighter_gang_legacy_edition_id_idx
  ON public.fighter_gang_legacy (edition_id);

-- Backfill from the associated fighter type, then n23 for any remainder.
UPDATE public.fighter_gang_legacy fgl
SET edition_id = ft.edition_id
FROM public.fighter_types ft
WHERE ft.id = fgl.fighter_type_id
  AND fgl.edition_id IS NULL
  AND ft.edition_id IS NOT NULL;

DO $$
DECLARE
  base_edition_id uuid;
BEGIN
  SELECT id INTO STRICT base_edition_id FROM public.editions WHERE slug = 'n23';

  UPDATE public.fighter_gang_legacy
  SET edition_id = base_edition_id
  WHERE edition_id IS NULL;
END $$;
