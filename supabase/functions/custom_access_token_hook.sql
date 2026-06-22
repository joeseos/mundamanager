CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  profile_row record;
  campaign_roles_json jsonb;
BEGIN
  claims := event->'claims';

  -- Profile data
  SELECT
    user_role,
    username,
    patreon_tier_id,
    patreon_tier_title,
    patron_status
  INTO profile_row
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  IF NOT FOUND THEN
    RETURN event;
  END IF;

  claims := jsonb_set(
    claims,
    '{user_profile}',
    jsonb_build_object(
      'user_role', COALESCE(profile_row.user_role, 'user'),
      'username', profile_row.username,
      'patreon_tier_id', profile_row.patreon_tier_id,
      'patreon_tier_title', profile_row.patreon_tier_title,
      'patron_status', profile_row.patron_status
    )
  );

  -- Campaign roles — deduplicated to highest-privilege role per campaign
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', deduped.campaign_id, 'role', deduped.role)
  ), '[]'::jsonb)
  INTO campaign_roles_json
  FROM (
    SELECT DISTINCT ON (cm.campaign_id)
      cm.campaign_id, cm.role
    FROM public.campaign_members cm
    WHERE cm.user_id = (event->>'user_id')::uuid
    ORDER BY cm.campaign_id,
      CASE cm.role
        WHEN 'OWNER' THEN 1
        WHEN 'ARBITRATOR' THEN 2
        WHEN 'MEMBER' THEN 3
        ELSE 4
      END
  ) deduped;

  claims := jsonb_set(claims, '{campaign_roles}', campaign_roles_json);

  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.campaign_members TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
