-- Stamp profiles.first_confirmed_session_at on the first auth session after
-- email confirm. Bound to auth.users as AFTER UPDATE only (WHEN both
-- timestamps are newly complete). INSERT-time confirmed users (SSO /
-- magic-link) are stamped inside handle_new_user, which creates the profiles
-- row in the same function so the stamp cannot race a second AFTER INSERT
-- trigger. See supabase/bootstrap/auth_trigger.sql and the
-- onboarding_notifications migration. Does not insert notifications.
--
-- DEPLOY ORDER: apply the onboarding_notifications migration (which adds the
-- column) BEFORE this trigger goes live. Local seed skips the bind until
-- the function and column both exist.

CREATE OR REPLACE FUNCTION public.stamp_first_confirmed_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND NEW.last_sign_in_at IS NOT NULL THEN
    UPDATE public.profiles
    SET first_confirmed_session_at = NEW.last_sign_in_at
    WHERE id = NEW.id
      AND first_confirmed_session_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_first_confirmed_session() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stamp_first_confirmed_session() FROM anon;
REVOKE EXECUTE ON FUNCTION public.stamp_first_confirmed_session() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_first_confirmed_session() TO service_role;
