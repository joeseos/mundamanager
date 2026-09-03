-- Alternate house gang lists (House Escher: Wyld Hunt, House Goliath: Unborn Gang, …)
-- are their own gang_types rows with their own fighter catalogs. Until now the
-- only link to the house was the name prefix. That is a display string, not a
-- join key: Variant: Chaos Corrupted also contains a colon, and anything that
-- needs "is this Escher?" (hatred, trading post, house equipment) cannot safely
-- parse it.
--
-- parent_gang_type_id is that link. NULL = root type (House Escher). Set =
-- replacement gang list of that house. Created gangs still store the gang list's own
-- gang_type_id; join here when you need the house.
--
-- The composite FK against (gang_type_id, edition_id) forces parent and child
-- to share an edition (MATCH SIMPLE leaves roots with a null parent alone).
-- A trigger keeps the tree one level deep: the parent must itself be a root,
-- and a type that already has children cannot become a child.

ALTER TABLE public.gang_types
  ADD COLUMN IF NOT EXISTS parent_gang_type_id uuid;

COMMENT ON COLUMN public.gang_types.parent_gang_type_id IS
  'House this gang list belongs to. House Escher: Wyld Hunt stores House Escher''s '
  'gang_type_id here; House Escher itself stores null. Each row keeps its own '
  'fighter types.';

CREATE INDEX IF NOT EXISTS gang_types_parent_gang_type_id_idx
  ON public.gang_types (parent_gang_type_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gang_types_parent_not_self_check'
      AND conrelid = 'public.gang_types'::regclass
  ) THEN
    ALTER TABLE public.gang_types
      ADD CONSTRAINT gang_types_parent_not_self_check
      CHECK (parent_gang_type_id IS DISTINCT FROM gang_type_id);
  END IF;
END $$;

-- Composite FK is MATCH SIMPLE: if parent_gang_type_id is set but edition_id
-- is null, Postgres does not check that the parent is in the same edition.
-- This CHECK requires edition_id whenever a parent is set.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gang_types_parent_requires_edition_check'
      AND conrelid = 'public.gang_types'::regclass
  ) THEN
    ALTER TABLE public.gang_types
      ADD CONSTRAINT gang_types_parent_requires_edition_check
      CHECK (parent_gang_type_id IS NULL OR edition_id IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gang_types_parent_gang_type_edition_fkey'
      AND conrelid = 'public.gang_types'::regclass
  ) THEN
    ALTER TABLE public.gang_types
      ADD CONSTRAINT gang_types_parent_gang_type_edition_fkey
      FOREIGN KEY (parent_gang_type_id, edition_id)
      REFERENCES public.gang_types (gang_type_id, edition_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Trigger body also lives in supabase/functions/gang_types_parent_must_be_root.sql
-- (canonical source redeployed by CI). Included here so the first apply is complete.
CREATE OR REPLACE FUNCTION public.gang_types_parent_must_be_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_gang_type_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.gang_types
      WHERE gang_type_id = NEW.parent_gang_type_id
        AND parent_gang_type_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'parent_gang_type_id must reference a root gang type';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.gang_types
      WHERE parent_gang_type_id = NEW.gang_type_id
    ) THEN
      RAISE EXCEPTION 'cannot set parent_gang_type_id on a gang type that is already a parent of other gang lists';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.gang_types_parent_must_be_root() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gang_types_parent_must_be_root() FROM anon, authenticated;

DROP TRIGGER IF EXISTS gang_types_parent_must_be_root ON public.gang_types;
CREATE TRIGGER gang_types_parent_must_be_root
  BEFORE INSERT OR UPDATE OF parent_gang_type_id ON public.gang_types
  FOR EACH ROW
  EXECUTE FUNCTION public.gang_types_parent_must_be_root();

-- One-time name heuristic: "{parent}: {suffix}" whose parent exists as an exact
-- gang_type in the same edition. starts_with, not LIKE, so %/_ in a name are
-- literal. A scalar subquery raises if a child matches more than one root
-- (UPDATE ... FROM would otherwise pick one at random). Does not match
-- Variant: … (no type named Variant).
UPDATE public.gang_types AS child
SET parent_gang_type_id = (
  SELECT parent.gang_type_id
  FROM public.gang_types AS parent
  WHERE parent.parent_gang_type_id IS NULL
    AND child.gang_type_id IS DISTINCT FROM parent.gang_type_id
    AND child.edition_id IS NOT DISTINCT FROM parent.edition_id
    AND starts_with(child.gang_type, parent.gang_type || ': ')
)
WHERE child.parent_gang_type_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.gang_types AS parent
    WHERE parent.parent_gang_type_id IS NULL
      AND child.gang_type_id IS DISTINCT FROM parent.gang_type_id
      AND child.edition_id IS NOT DISTINCT FROM parent.edition_id
      AND starts_with(child.gang_type, parent.gang_type || ': ')
  );
