-- Keep gang_types.parent_gang_type_id one level deep: the parent must itself be
-- a root, and a type that already has children cannot become a child.
--
-- DEPLOY ORDER: apply migration 20260902172743_add_gang_types_parent_gang_type_id.sql
-- (which creates the column) BEFORE this trigger goes live. UPDATE OF
-- parent_gang_type_id will fail if the column does not exist.
--
-- Also apply migration 20261004120000_rename_gang_types_gang_type_id_to_id.sql
-- BEFORE this file deploys. The checks read gang_types.id, which is an unused
-- bigint until that migration drops it and renames gang_type_id to id.

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
      WHERE id = NEW.parent_gang_type_id
        AND parent_gang_type_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'parent_gang_type_id must reference a root gang type';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.gang_types
      WHERE parent_gang_type_id = NEW.id
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
