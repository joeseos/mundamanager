import 'server-only';

import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { SUPABASE_ROOT_CA } from './supabase-ca';

/**
 * Direct Postgres connection for server-side reads, outside the Data API, so
 * they add no API gateway log entries (billed as Logs Ingest).
 *
 * DATABASE_URL is the shared pooler in transaction mode (port 6543), signed in
 * as the read-only app_server role: RLS applies as for `authenticated`, but
 * with no user. Policies that check auth.uid() return no rows, and nothing
 * here checks who is asking, so authenticate the request before reading.
 */

export type AppDb = PostgresJsDatabase<typeof schema>;

// One pool per server instance, reused across requests (and across dev HMR).
const globalForDb = globalThis as unknown as { appDb?: AppDb };

/** The shared connection, or null when DATABASE_URL is not set. */
export function getAppDb(): AppDb | null {
  if (globalForDb.appDb) return globalForDb.appDb;

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const client = postgres(url, {
    // TLS, verifying the pooler's certificate and hostname against Supabase's root CA
    // (postgres.js connects without TLS unless asked, and 'require' skips verification).
    ssl: { ca: SUPABASE_ROOT_CA },
    // The transaction pooler cannot hold prepared statements across transactions.
    prepare: false,
    // Each serverless instance keeps a small pool; the pooler's client limit
    // (600 on Medium compute) is shared by every instance.
    max: 3,
    // Close idle connections quickly so suspended instances do not hold pooler slots.
    idle_timeout: 20,
    // Fail fast when the pooler is unreachable.
    connect_timeout: 5,
  });

  globalForDb.appDb = drizzle(client, { schema });
  return globalForDb.appDb;
}
