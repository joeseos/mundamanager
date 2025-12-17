-- Migration: Add cached permission RPC functions
-- Purpose: Reduce 3-4 uncached queries to 1 cached RPC call for permission checks
-- Created: 2025-12-17
-- Related: app/lib/user-permissions.ts

-- Drop existing functions if they exist (for idempotent migrations)
DROP FUNCTION IF EXISTS public.get_gang_permissions(UUID, UUID);

-- ============================================================================
-- Function: get_gang_permissions
-- Purpose: Consolidates 3 permission queries into 1 RPC call
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_gang_permissions(
  p_user_id UUID,
  p_gang_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin BOOLEAN := FALSE;
  v_is_owner BOOLEAN := FALSE;
  v_campaign_role TEXT := NULL;
  v_is_campaign_owner BOOLEAN := FALSE;
  v_is_campaign_arbitrator BOOLEAN := FALSE;
  v_can_edit BOOLEAN := FALSE;
  v_can_delete BOOLEAN := FALSE;
BEGIN
  -- Check if user is admin (profiles.user_role = 'admin')
  SELECT (user_role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE id = p_user_id;

  -- Default to false if user not found
  v_is_admin := COALESCE(v_is_admin, FALSE);

  -- Check if user owns the gang (gangs.user_id = p_user_id)
  SELECT (user_id = p_user_id) INTO v_is_owner
  FROM gangs
  WHERE id = p_gang_id;

  -- Default to false if gang not found
  v_is_owner := COALESCE(v_is_owner, FALSE);

  -- Get highest campaign role for this user across all campaigns containing this gang
  -- Role hierarchy: OWNER > ARBITRATOR > MEMBER
  SELECT
    CASE
      WHEN bool_or(cm.role = 'OWNER') THEN 'OWNER'
      WHEN bool_or(cm.role = 'ARBITRATOR') THEN 'ARBITRATOR'
      WHEN bool_or(cm.role = 'MEMBER') THEN 'MEMBER'
      ELSE NULL
    END INTO v_campaign_role
  FROM campaign_gangs cg
  INNER JOIN campaign_members cm ON cm.campaign_id = cg.campaign_id AND cm.user_id = p_user_id
  WHERE cg.gang_id = p_gang_id;

  -- Determine campaign permission flags
  v_is_campaign_owner := (v_campaign_role = 'OWNER');
  v_is_campaign_arbitrator := (v_campaign_role = 'ARBITRATOR');

  -- Calculate composite permissions
  v_can_edit := v_is_owner OR v_is_admin OR v_is_campaign_owner OR v_is_campaign_arbitrator;
  v_can_delete := v_is_owner OR v_is_admin OR v_is_campaign_owner OR v_is_campaign_arbitrator;

  -- Return JSON matching UserPermissions interface
  RETURN json_build_object(
    'isOwner', v_is_owner,
    'isAdmin', v_is_admin,
    'canEdit', v_can_edit,
    'canDelete', v_can_delete,
    'canView', TRUE,
    'userId', p_user_id
  );
END;
$$;


-- ============================================================================
-- Grant permissions
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_gang_permissions(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gang_permissions(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gang_permissions(UUID, UUID) TO service_role;

-- ============================================================================
-- Add comment
-- ============================================================================
COMMENT ON FUNCTION public.get_gang_permissions(UUID, UUID) IS
'Returns gang permissions for a user. Consolidates 3 queries (profiles, gangs, campaign_members) into 1 RPC call. Used for both gang and fighter permissions.';
