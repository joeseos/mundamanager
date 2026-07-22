-- Bootstrap: the `private` schema
--
-- `private` holds the SECURITY DEFINER helpers that Row Level Security policies
-- lean on across the database (private.is_admin(), private.is_arb(campaign_id)).
-- The committed schema snapshot (../schema/schema.public.sql) is produced with
-- `pg_dump --schema=public`, so it can NOT contain this schema even though 200+
-- of its RLS policies reference it. That is why the snapshot fails to load on a
-- fresh database unless this schema (and its functions) already exist.
--
-- The helper function bodies themselves live in ../functions/is_admin.sql and
-- ../functions/is_arb.sql (deployed to the remote by deploy_supabase_functions.yml);
-- the local bootstrap loads those two files right after this one.
--
-- USAGE on the schema must be granted to the API roles, otherwise policies that
-- call private.is_admin()/is_arb() as `authenticated` fail with "permission
-- denied for schema private" — the calling role needs schema USAGE even for a
-- SECURITY DEFINER function.

SET check_function_bodies = off;

create schema if not exists private;

grant usage on schema private to anon, authenticated, service_role;
