CREATE OR REPLACE FUNCTION public.save_gang_skill_set_ranks(
    p_gang_id uuid,
    p_ranks jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.gang_skill_set_ranks WHERE gang_id = p_gang_id;

    INSERT INTO public.gang_skill_set_ranks (gang_id, rank, skill_type_id)
    SELECT p_gang_id, (r->>'rank')::int, (r->>'skill_type_id')::uuid
    FROM jsonb_array_elements(p_ranks) r;
END;
$$;

REVOKE ALL ON FUNCTION public.save_gang_skill_set_ranks(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_gang_skill_set_ranks(uuid, jsonb) TO authenticated, service_role;
