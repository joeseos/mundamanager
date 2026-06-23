-- =============================================================
-- Cross-schema triggers and privileges
-- =============================================================
-- These objects reference tables outside the `public` schema
-- (e.g. auth.users) and are NOT captured by the nightly
-- pg_dump --schema=public snapshot.
--
-- Run this file AFTER importing schema.public.sql.
-- =============================================================

-- Create a profiles row when a new auth user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- The function should not be callable by API users directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
