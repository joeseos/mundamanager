-- equipment_categories was omitted from the original catalog-root edition_id
-- pass; mirror the same nullable column + FK + index + backfill used for equipment.

ALTER TABLE public.equipment_categories
  ADD COLUMN IF NOT EXISTS edition_id uuid
    REFERENCES public.editions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS equipment_categories_edition_id_idx
  ON public.equipment_categories (edition_id);

-- Backfill existing catalog rows onto the current edition. edition_id stays
-- nullable here; NOT NULL follows once every write path passes it explicitly.
UPDATE public.equipment_categories
SET edition_id = (
  SELECT id
  FROM public.editions
  WHERE slug = 'n23'
)
WHERE edition_id IS NULL;
