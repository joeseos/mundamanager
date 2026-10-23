-- Stop signed-in users from changing their own user_role.
--
-- "Users can update own profile" only checks that the row is the user's own,
-- and authenticated held UPDATE on every profiles column, so any user could
-- PATCH /rest/v1/profiles?id=eq.<own id> with {"user_role": "admin"} and pass
-- private.is_admin(), checkAdmin() and every admin RLS policy.
--
-- The app's only user-client writes to profiles are username and updated_at
-- (app/actions/user.ts). Patreon fields are written with the service role, and
-- new profiles are created by the SECURITY DEFINER signup trigger, so neither
-- needs these grants. Column grants leave the RLS policies as they are.

BEGIN;

REVOKE INSERT, UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

GRANT UPDATE (username, updated_at) ON TABLE public.profiles TO authenticated;
GRANT INSERT (id, username) ON TABLE public.profiles TO authenticated;

COMMIT;
