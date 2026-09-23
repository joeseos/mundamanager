-- Cap a gang at 100 fighter rows (dead, retired and exotic beasts included,
-- since the gang page loads all of them). Enforced here rather than in server
-- actions because RLS allows direct inserts via the REST API.
-- Raises SQLSTATE MM001 so callers can tell it apart from fighters' CHECK constraints.

CREATE OR REPLACE FUNCTION public.enforce_gang_fighter_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- count every fighter in the gang, whatever the caller's RLS allows
SET search_path = public
AS $$
DECLARE
  max_fighters constant integer := 100;
  current_count integer;
BEGIN
  IF NEW.gang_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.gang_id IS NOT DISTINCT FROM OLD.gang_id) THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent inserts into the same gang so two requests can't both see 99
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.gang_id::text, 0));

  SELECT count(*) INTO current_count
  FROM public.fighters
  WHERE gang_id = NEW.gang_id;

  IF current_count >= max_fighters THEN
    RAISE EXCEPTION 'Max % fighters are allowed', max_fighters
      USING ERRCODE = 'MM001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_gang_fighter_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_gang_fighter_limit() FROM anon, authenticated;

DROP TRIGGER IF EXISTS enforce_gang_fighter_limit ON public.fighters;
CREATE TRIGGER enforce_gang_fighter_limit
  BEFORE INSERT OR UPDATE OF gang_id ON public.fighters
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_gang_fighter_limit();
