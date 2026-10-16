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
 * DRIZZLE_DATABASE_URL is the shared pooler in transaction mode (port 6543),
 * signed in as the app_server role. That role holds no table privileges of its
 * own: it can only read anything inside withRls(), which switches it to
 * `authenticated` for one transaction so every RLS policy applies as usual.
 *
 * Unset DRIZZLE_DATABASE_URL and nothing connects; callers fall back to the
 * Data API.
 */

export type AppDatabase = PostgresJsDatabase<typeof schema>;

// One pool per server instance, reused across requests (and across dev HMR).
const globalForDb = globalThis as unknown as { appDb?: AppDatabase };

export function getAppDb(): AppDatabase {
  if (globalForDb.appDb) return globalForDb.appDb;

  const url = process.env.DRIZZLE_DATABASE_URL;
  if (!url) {
    throw new Error('DRIZZLE_DATABASE_URL is not set');
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
    max_lifetime: 60 * 30,
  });

  globalForDb.appDb = drizzle(client, { schema });
  return globalForDb.appDb;
}
