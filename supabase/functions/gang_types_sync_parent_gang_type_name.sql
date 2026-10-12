-- Keep gang_types.parent_gang_type_name aligned with the parent row.
-- BEFORE parent_gang_type_id: copy the parent's gang_type, or null for a root.
-- AFTER gang_type: a renamed house updates every child list that points at it.
--
-- DEPLOY ORDER: apply migration 20261012133225_add_gang_types_parent_gang_type_name.sql
-- (which creates parent_gang_type_name) BEFORE this file goes live. The set
-- trigger writes that column and will fail if it does not exist.

CREATE OR REPLACE FUNCTION public.gang_types_set_parent_gang_type_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_gang_type_id IS NULL THEN
    NEW.parent_gang_type_name := NULL;
  ELSE
    SELECT parent.gang_type
    INTO NEW.parent_gang_type_name
    FROM public.gang_types AS parent
    WHERE parent.id = NEW.parent_gang_type_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.gang_types_set_parent_gang_type_name() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gang_types_set_parent_gang_type_name() FROM anon, authenticated;

DROP TRIGGER IF EXISTS gang_types_set_parent_gang_type_name ON public.gang_types;
CREATE TRIGGER gang_types_set_parent_gang_type_name
  BEFORE INSERT OR UPDATE OF parent_gang_type_id ON public.gang_types
  FOR EACH ROW
  EXECUTE FUNCTION public.gang_types_set_parent_gang_type_name();

CREATE OR REPLACE FUNCTION public.gang_types_propagate_parent_gang_type_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.gang_type IS DISTINCT FROM NEW.gang_type THEN
    UPDATE public.gang_types
    SET parent_gang_type_name = NEW.gang_type
    WHERE parent_gang_type_id = NEW.id
      AND parent_gang_type_name IS DISTINCT FROM NEW.gang_type;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.gang_types_propagate_parent_gang_type_name() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gang_types_propagate_parent_gang_type_name() FROM anon, authenticated;

DROP TRIGGER IF EXISTS gang_types_propagate_parent_gang_type_name ON public.gang_types;
CREATE TRIGGER gang_types_propagate_parent_gang_type_name
  AFTER UPDATE OF gang_type ON public.gang_types
  FOR EACH ROW
  EXECUTE FUNCTION public.gang_types_propagate_parent_gang_type_name();
