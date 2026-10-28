BEGIN;

-- ============================================================================
-- READ-ONLY LOGIN ROLE FOR THE SERVER'S DIRECT DATABASE CONNECTION
-- utils/db/client.ts (Drizzle) signs in as app_server. It inherits
-- `authenticated`'s privileges with no user, so RLS applies and auth.uid() is
-- NULL. It cannot switch roles, bypass RLS or change the schema.
-- default_transaction_read_only guards against accidental writes; a session can
-- turn it off, so it is not a security boundary.
--
-- The password is not part of this migration. Set it in the SQL editor, then
-- put the transaction pooler URL (port 6543, user app_server.<project-ref>) in
-- DATABASE_URL:
--   ALTER ROLE app_server WITH PASSWORD '<generated secret>';
--
-- DEPLOY ORDER: apply before deploying code with DATABASE_URL set.
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
