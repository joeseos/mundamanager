#!/usr/bin/env bash
#
# setup-local-db.sh — bootstrap a fresh LOCAL Supabase database.
#
# Why this exists:
#   supabase/migrations/ holds INCREMENTAL deltas meant for developers who
#   already have the full database. They assume a base schema that was never
#   captured as a migration, so `supabase start` cannot replay them from an
#   empty database (it crashes on the first ALTER TABLE of a table that does
#   not exist yet). Local migration auto-run is therefore disabled in
#   supabase/config.toml ([db.migrations] enabled = false).
#
#   New developers instead load the committed full schema snapshot
#   (supabase/schema/schema.public.sql, regenerated daily by CI) plus the three
#   pieces a `--schema=public` dump can never contain: the `private` schema, the
#   auth.users trigger, and the standard public-schema grants. This script loads
#   all of them, in the order the RLS policies require.
#
# Usage:
#   ./scripts/setup-local-db.sh
#
#   Requires the Supabase CLI and a psql client (v15+; a v17 client is fine).
#   Override the target database with SUPABASE_DB_URL if your local stack does
#   not use the default port:
#       SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

set -euo pipefail

# --- resolve paths -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SUPABASE_DIR="$REPO_ROOT/supabase"
cd "$REPO_ROOT"

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

# --- preflight ---------------------------------------------------------------
command -v supabase >/dev/null 2>&1 || { echo "error: the Supabase CLI is not installed (https://supabase.com/docs/guides/cli)"; exit 1; }
command -v psql     >/dev/null 2>&1 || { echo "error: psql is not installed (Postgres client tools)"; exit 1; }

echo "==> Ensuring the local Supabase stack is running (supabase start)…"
supabase start

echo "==> Target database: $DB_URL"

# One psql session per step, ON_ERROR_STOP so any failure aborts the bootstrap.
run_sql() { psql "$DB_URL" -v ON_ERROR_STOP=1 --quiet "$@"; }

# --- 1. reset public + private schema + RLS helper functions -----------------
# The public schema is dropped and recreated so this script is safely re-runnable
# (a pg_dump snapshot is not idempotent — re-loading over existing tables fails).
# This DISCARDS any existing local data in public.
#
# The private schema + helpers are created before the snapshot loads: 200+ of its
# policies reference private.is_admin()/private.is_arb(), which must already
# exist. check_function_bodies=off lets the helpers compile now, before the
# public tables they read exist.
echo "==> [1/5] Resetting public and creating the private schema + RLS helpers…"
run_sql \
  -c 'drop schema if exists public cascade;' \
  -c 'create schema public;' \
  -c 'set check_function_bodies = off;' \
  -f "$SUPABASE_DIR/bootstrap/private_schema.sql" \
  -f "$SUPABASE_DIR/functions/is_admin.sql" \
  -f "$SUPABASE_DIR/functions/is_arb.sql"

# --- 2. full public schema snapshot ------------------------------------------
# The dump is emitted by pg_dump 17 and carries `\restrict`/`\unrestrict` meta
# commands (unknown to older psql) and a `CREATE SCHEMA public;` that clashes
# with the public schema we just recreated in step 1. Strip those before loading;
# every object lands in that fresh public schema.
echo "==> [2/5] Loading the public schema snapshot…"
STRIPPED="$(mktemp)"
trap 'rm -f "$STRIPPED"' EXIT
sed -E '/^\\restrict/d; /^\\unrestrict/d; /^CREATE SCHEMA public;$/d' \
  "$SUPABASE_DIR/schema/schema.public.sql" > "$STRIPPED"
run_sql -f "$STRIPPED"

# --- 3. restore standard Supabase grants -------------------------------------
# The snapshot is dumped --no-privileges, so re-grant public to the API roles.
echo "==> [3/5] Restoring public-schema grants for the API roles…"
run_sql -f "$SUPABASE_DIR/bootstrap/grants.sql"

# --- 4. auth.users signup trigger --------------------------------------------
echo "==> [4/5] Installing the auth.users signup trigger…"
run_sql -f "$SUPABASE_DIR/bootstrap/auth_trigger.sql"

# --- 5. optional local seed data ---------------------------------------------
# Auto-seeding is disabled in config.toml (it would run before the schema loads),
# so the seed is applied here, last, once every table exists.
if [[ -f "$SUPABASE_DIR/seed.sql" ]]; then
  echo "==> [5/5] Applying local seed data (supabase/seed.sql)…"
  run_sql -f "$SUPABASE_DIR/seed.sql"
else
  echo "==> [5/5] No supabase/seed.sql found — skipping seed data."
fi

echo ""
echo "✅ Local database ready."
echo "   Point .env.local at the local stack (see 'supabase status' for the URL and anon key)."
echo "   Note: 'supabase db reset' wipes the database — re-run this script afterwards."
