BEGIN;

-- ============================================================================
-- READ-ONLY LOGIN ROLE FOR THE SERVER'S DIRECT DATABASE CONNECTION
-- The Next.js server reads some data over a direct Postgres connection
-- (Drizzle, utils/db/client.ts) instead of the Data API, so those reads add no
-- API gateway log entries (billed as Logs Ingest). It signs in as app_server.
--
-- app_server inherits `authenticated`'s table privileges, so RLS applies to it
-- exactly as to a signed-in Data API request, but with no user: auth.uid() is
-- NULL, and policies that check it return no rows. It cannot switch roles,
-- bypass RLS, change the schema or read the auth schema.
--
-- default_transaction_read_only stops accidental writes. A session can turn it
-- off, so it is a guard, not a security boundary: the password is a server
-- secret like SUPABASE_SERVICE_ROLE_KEY, which can do strictly more.
--
-- The password is not part of this migration. After applying it, set one in
-- the SQL editor and put the transaction pooler URL (port 6543, user
-- app_server.<project-ref>) in DATABASE_URL:
--   ALTER ROLE app_server WITH PASSWORD '<generated secret>';
--
-- DEPLOY ORDER: none. Nothing connects as app_server until DATABASE_URL is set.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_server') THEN
    CREATE ROLE app_server WITH LOGIN;
  END IF;
END
$$;

GRANT authenticated TO app_server WITH INHERIT TRUE, SET FALSE;

ALTER ROLE app_server SET default_transaction_read_only = on;
-- authenticated's own 8s timeout is a role setting, which applies at sign-in only
ALTER ROLE app_server SET statement_timeout = '8s';

COMMIT;
