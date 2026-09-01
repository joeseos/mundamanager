-- Single-fighter counterpart of replace_gang_skill_set_ranks: delete+insert of
-- that fighter's rank-owned override rows in one transaction.
-- SECURITY INVOKER: table RLS still decides who may write. auth.uid() is required
-- and is stamped as override user_id; payload fighter_id is ignored in favour of
-- p_fighter_id so a caller cannot attach rows to a different fighter in this call.

CREATE OR REPLACE FUNCTION public.replace_fighter_skill_access_overrides(
  p_fighter_id uuid,
  p_owned_skill_type_ids uuid[],
  p_overrides jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_fighter_id IS NULL THEN
    RAISE EXCEPTION 'fighter_id is required';
  END IF;

  IF p_owned_skill_type_ids IS NOT NULL AND cardinality(p_owned_skill_type_ids) > 0 THEN
    DELETE FROM public.fighter_skill_access_override
    WHERE fighter_id = p_fighter_id
      AND skill_type_id = ANY (p_owned_skill_type_ids);
  END IF;

  INSERT INTO public.fighter_skill_access_override (
    fighter_id, skill_type_id, access_level, user_id
  )
  SELECT p_fighter_id, o.skill_type_id, o.access_level, v_user
  FROM jsonb_to_recordset(COALESCE(p_overrides, '[]'::jsonb))
    AS o(skill_type_id uuid, access_level text)
  WHERE o.skill_type_id IS NOT NULL
    AND o.access_level IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_fighter_skill_access_overrides(uuid, uuid[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_fighter_skill_access_overrides(uuid, uuid[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_fighter_skill_access_overrides(uuid, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_fighter_skill_access_overrides(uuid, uuid[], jsonb) TO service_role;

COMMENT ON FUNCTION public.replace_fighter_skill_access_overrides(uuid, uuid[], jsonb) IS
  'Atomically rewrites fighter_skill_access_override rows for one fighter and the given skill types. SECURITY INVOKER: RLS of the caller still applies.';
