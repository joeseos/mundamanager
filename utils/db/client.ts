import 'server-only';

import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * Direct Postgres connection for server-side reads.
 *
 * Queries over this connection skip the Supabase Data API, so they produce no
 * API gateway log entry (one per request, ~3 KB each, billed as Logs Ingest).
 * Postgres itself only logs DDL (log_statement = ddl), so reads here are not
 * logged at all.
 *
 * DATABASE_URL is the shared pooler in transaction mode (port 6543), signed in
 * as the read-only app_server role. It acts as `authenticated` with no user, so
 * RLS applies and policies that check auth.uid() return no rows.
 *
 * Unset DATABASE_URL and nothing connects; callers fall back to the Data API.
 */

// One pool per server instance, reused across requests (and across dev HMR).
const globalForDb = globalThis as unknown as { appDb?: PostgresJsDatabase<typeof schema> };

export function getAppDb() {
  if (globalForDb.appDb) return globalForDb.appDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(url, {
    // The transaction pooler cannot hold prepared statements across transactions.
    prepare: false,
    // Each serverless instance keeps a small pool; the pooler's client limit
    // (600 on Medium compute) is shared by every instance.
    max: 3,
    // Close idle connections quickly so suspended instances do not hold pooler slots.
    idle_timeout: 20,
    // A failed connection falls back to the Data API; keep that wait short.
    connect_timeout: 5,
  });

  globalForDb.appDb = drizzle(client, { schema });
  return globalForDb.appDb;
}
