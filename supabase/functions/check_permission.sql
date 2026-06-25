-- Permission check RPC for app-level authorization.
-- RLS helpers (private.is_admin, private.is_arb) stay separate.

CREATE OR REPLACE FUNCTION public.check_permission(
  p_user_id UUID,
  p_campaign_id UUID DEFAULT NULL,
  p_gang_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin BOOLEAN := FALSE;
  v_campaign_role TEXT := NULL;
BEGIN
  SELECT (user_role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE id = p_user_id;

  v_is_admin := COALESCE(v_is_admin, FALSE);

  IF p_campaign_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN bool_or(cm.role = 'OWNER') THEN 'OWNER'
        WHEN bool_or(cm.role = 'ARBITRATOR') THEN 'ARBITRATOR'
        WHEN bool_or(cm.role = 'MEMBER') THEN 'MEMBER'
        ELSE NULL
      END INTO v_campaign_role
    FROM campaign_members cm
    WHERE cm.campaign_id = p_campaign_id
      AND cm.user_id = p_user_id;

  ELSIF p_gang_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN bool_or(cm.role = 'OWNER') THEN 'OWNER'
        WHEN bool_or(cm.role = 'ARBITRATOR') THEN 'ARBITRATOR'
        WHEN bool_or(cm.role = 'MEMBER') THEN 'MEMBER'
        ELSE NULL
      END INTO v_campaign_role
    FROM campaign_gangs cg
    INNER JOIN campaign_members cm ON cm.campaign_id = cg.campaign_id AND cm.user_id = p_user_id
    WHERE cg.gang_id = p_gang_id
      AND cg.status = 'ACCEPTED';
  END IF;

  RETURN json_build_object(
    'is_admin', v_is_admin,
    'campaign_role', v_campaign_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_permission(UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_permission(UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_permission(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_permission(UUID, UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.check_permission(UUID, UUID, UUID) IS
'Returns { is_admin, campaign_role } for a user. Accepts campaign_id directly or resolves it from gang_id via campaign_gangs. Used for all app-level permission checks.';
