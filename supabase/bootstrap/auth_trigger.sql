-- Bootstrap: the auth.users signup trigger
--
-- On signup this trigger creates the matching public.profiles row. The trigger
-- FUNCTION (public.handle_new_user) lives in the public schema and therefore IS
-- included in ../schema/schema.public.sql. The TRIGGER itself sits on auth.users,
-- so a `pg_dump --schema=public` snapshot can never capture it — this file
-- recreates just the binding after the snapshot has loaded the function.
--
-- Canonical copy of the function + trigger:
--   ../migrations/20260525_create_handle_new_user_trigger.sql
-- Keep the two in sync if the trigger definition ever changes.

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
