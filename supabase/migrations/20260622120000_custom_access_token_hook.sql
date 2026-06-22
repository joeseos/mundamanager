-- Custom Access Token Hook + JWT-optimized RLS functions
--
-- After applying, enable the hook in:
--   Supabase Dashboard → Auth → Hooks → Custom Access Token Hook
--   → select public.custom_access_token_hook

-- 1. Custom access token hook: injects profile data + campaign roles into JWT
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

-- 2. Optimize is_admin() to read from JWT claims, with DB fallback for old JWTs
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
BEGIN
  IF auth.jwt()->'user_profile' IS NOT NULL THEN
    RETURN coalesce(
      auth.jwt()->'user_profile'->>'user_role' = 'admin',
      false
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
    AND p.user_role = 'admin'
  );
END;
$$;

-- 3. Optimize is_arb() to read from JWT claims, with DB fallback for old JWTs
CREATE OR REPLACE FUNCTION private.is_arb(campaign_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
BEGIN
  -- If JWT has campaign_roles, use them (fast path)
  IF auth.jwt()->'campaign_roles' IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements(auth.jwt()->'campaign_roles') AS cr
      WHERE (cr->>'id')::uuid = campaign_id_param
      AND cr->>'role' IN ('OWNER', 'ARBITRATOR')
    );
  END IF;

  -- Fallback for old JWTs without campaign_roles
  RETURN EXISTS (
    SELECT 1
    FROM campaign_members cm
    WHERE cm.campaign_id = campaign_id_param
    AND cm.user_id = auth.uid()
    AND cm.role IN ('OWNER', 'ARBITRATOR')
  );
END;
$$;
