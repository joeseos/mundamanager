-- House name for a child gang list (Wyld Cult stores "House Escher").
-- The trigger owns the column: every insert or update copies it from the
-- parent link (a direct write is overwritten), and a renamed house refreshes
-- every child.
--
-- Trigger bodies also live in supabase/functions/gang_types_sync_parent_gang_type_name.sql
-- (canonical source redeployed by CI). Included here so the first apply is complete.

ALTER TABLE public.gang_types
  ADD COLUMN IF NOT EXISTS parent_gang_type_name text;

COMMENT ON COLUMN public.gang_types.parent_gang_type_name IS
  'House name copied from the parent gang type. Null on root types. '
  'Owned by gang_types_set_parent_gang_type_name and '
  'gang_types_propagate_parent_gang_type_name; do not write it from the app.';

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
  BEFORE INSERT OR UPDATE ON public.gang_types
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

UPDATE public.gang_types AS child
SET parent_gang_type_name = parent.gang_type
FROM public.gang_types AS parent
WHERE child.parent_gang_type_id = parent.id
  AND child.parent_gang_type_name IS DISTINCT FROM parent.gang_type;
