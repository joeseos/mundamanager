-- skill_types.name was globally unique, which blocks the same skill-set name
-- across editions (e.g. Agility for both n23 and n26). Scope uniqueness to
-- (edition_id, name) instead.

ALTER TABLE public.skill_types
  DROP CONSTRAINT IF EXISTS skill_types_name_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skill_types_edition_id_name_key'
      AND conrelid = 'public.skill_types'::regclass
  ) THEN
    ALTER TABLE public.skill_types
      ADD CONSTRAINT skill_types_edition_id_name_key
      UNIQUE (edition_id, name);
  END IF;
END $$;

COMMENT ON CONSTRAINT skill_types_edition_id_name_key ON public.skill_types IS
  'Skill-set names are unique within an edition, not globally.';
