-- Custom Access Token Hook — injects profile data into JWT
--
-- After applying, enable the hook in:
--   Supabase Dashboard → Auth → Hooks → Custom Access Token Hook
--   → select public.custom_access_token_hook

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
BEGIN
  claims := event->'claims';

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

  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
