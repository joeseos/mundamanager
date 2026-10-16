-- ============================================================================
-- LOGIN ROLE FOR THE SERVER'S DIRECT DATABASE CONNECTION
-- The Next.js server reads some data over a direct Postgres connection
-- (Drizzle, utils/db/client.ts) instead of the Data API, so those reads add no
-- API gateway log entries (billed as Logs Ingest). It signs in as app_server.
--
-- app_server is set up like Supabase's own `authenticator`, the role the Data
-- API signs in as: it may SET ROLE authenticated but inherits none of its
-- privileges, so on its own it can read nothing. utils/db/rls.ts switches to
-- `authenticated` with the user's verified JWT claims for each transaction, so
-- every RLS policy applies as it does for the Data API, and a query that skips
-- that wrapper fails instead of bypassing RLS.
--
-- The password is not part of this migration. After applying it, set one in
-- the SQL editor and put the transaction pooler URL (port 6543, user
-- app_server.<project-ref>) in DRIZZLE_DATABASE_URL:
--   ALTER ROLE app_server WITH PASSWORD '<generated secret>';
--
-- DEPLOY ORDER: none. Nothing connects as app_server until
-- DRIZZLE_DATABASE_URL is set.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_server') THEN
    CREATE ROLE app_server WITH LOGIN NOINHERIT;
  END IF;
END
$$;

-- The same membership authenticator has: may switch to authenticated, inherits nothing
GRANT authenticated TO app_server WITH INHERIT FALSE, SET TRUE;

-- The limits the Data API's authenticator runs with. Role settings apply at
-- sign-in, not on SET ROLE, so authenticated's own 8s timeout would not apply.
ALTER ROLE app_server SET statement_timeout = '8s';
ALTER ROLE app_server SET lock_timeout = '8s';

COMMIT;
