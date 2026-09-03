-- Replace a gang's ranked Skill Sets and the rank-derived fighter skill-access
-- overrides in one transaction. App-level delete-then-insert left an empty
-- rank table if the insert failed, and a failed override rewrite after a
-- successful rank write reported an error while the new ranks were already
-- persisted.
--
-- SECURITY INVOKER (same model as copy_custom_collection): writes still go
-- through table RLS. We only assert auth.uid() so anon/EXECUTE cannot slip
-- through, stamp override user_id from the session, and ignore override rows
-- whose fighter is not in p_gang_id. Rank shape (0–4 consecutive) stays in
-- the server action; table CHECKs already reject rank outside 1–4.

CREATE OR REPLACE FUNCTION public.replace_gang_skill_set_ranks(
  p_gang_id uuid,
  p_ranks jsonb,
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
  IF p_gang_id IS NULL THEN
    RAISE EXCEPTION 'gang_id is required';
  END IF;

  DELETE FROM public.gang_skill_set_ranks
  WHERE gang_id = p_gang_id;

  INSERT INTO public.gang_skill_set_ranks (gang_id, rank, skill_type_id)
  SELECT p_gang_id, r.rank, r.skill_type_id
  FROM jsonb_to_recordset(COALESCE(p_ranks, '[]'::jsonb))
    AS r(rank int, skill_type_id uuid)
  WHERE r.rank IS NOT NULL AND r.skill_type_id IS NOT NULL;

  IF p_owned_skill_type_ids IS NOT NULL AND cardinality(p_owned_skill_type_ids) > 0 THEN
    DELETE FROM public.fighter_skill_access_override
    WHERE fighter_id IN (SELECT id FROM public.fighters WHERE gang_id = p_gang_id)
      AND skill_type_id = ANY (p_owned_skill_type_ids);
  END IF;

  INSERT INTO public.fighter_skill_access_override (
    fighter_id, skill_type_id, access_level, user_id
  )
  SELECT o.fighter_id, o.skill_type_id, o.access_level, v_user
  FROM jsonb_to_recordset(COALESCE(p_overrides, '[]'::jsonb))
    AS o(fighter_id uuid, skill_type_id uuid, access_level text, user_id uuid)
  WHERE o.fighter_id IS NOT NULL
    AND o.skill_type_id IS NOT NULL
    AND o.access_level IS NOT NULL
    AND o.fighter_id IN (SELECT id FROM public.fighters WHERE gang_id = p_gang_id);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_gang_skill_set_ranks(uuid, jsonb, uuid[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_gang_skill_set_ranks(uuid, jsonb, uuid[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_gang_skill_set_ranks(uuid, jsonb, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_gang_skill_set_ranks(uuid, jsonb, uuid[], jsonb) TO service_role;

COMMENT ON FUNCTION public.replace_gang_skill_set_ranks(uuid, jsonb, uuid[], jsonb) IS
  'Atomically replaces gang_skill_set_ranks for a gang and rewrites fighter_skill_access_override rows for the owned skill types. SECURITY INVOKER: RLS of the caller still applies.';
