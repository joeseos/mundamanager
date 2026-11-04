-- True when the caller is an Owner or Arbitrator of a campaign the gang is
-- ACCEPTED in. Used by RLS policies on gang-owned tables.
CREATE OR REPLACE FUNCTION private.is_gang_arb(gang_id_param uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM campaign_gangs cg
    WHERE cg.gang_id = gang_id_param
    AND cg.status = 'ACCEPTED'
    AND private.is_arb(cg.campaign_id)
  );
$$;
