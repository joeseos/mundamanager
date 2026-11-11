-- Create the profiles row on auth.users INSERT. Also stamps
-- first_confirmed_session_at when the new user is already confirmed and has a
-- session (SSO / magic-link). That stamp must live here, not in a second
-- AFTER INSERT trigger: same-event triggers fire in name order, and a
-- separate stamp would silently no-op if it ran before this INSERT.
--
-- Later email-confirm / first sign-in is handled by
-- stamp_first_confirmed_session on AFTER UPDATE (see
-- supabase/bootstrap/auth_trigger.sql).
--
-- Bound to auth.users by supabase/bootstrap/auth_trigger.sql and
-- supabase/migrations/20260525_create_handle_new_user_trigger.sql.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'username'
  );

  IF NEW.email_confirmed_at IS NOT NULL AND NEW.last_sign_in_at IS NOT NULL THEN
    UPDATE public.profiles
    SET first_confirmed_session_at = NEW.last_sign_in_at
    WHERE id = NEW.id
      AND first_confirmed_session_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
