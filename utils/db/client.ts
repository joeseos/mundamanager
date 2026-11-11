import 'server-only';

import postgres from 'postgres';
import { sql } from 'drizzle-orm';
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
 * Tables whose policies check auth.uid() are read through withUserClaims.
 */

export type AppDb = PostgresJsDatabase<typeof schema>;
export type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

// The local Supabase stack's database has no TLS
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// One pool per server instance, reused across requests (and across dev HMR).
const globalForDb = globalThis as unknown as { appDb?: AppDb };

export function getAppDb(): AppDb {
  if (globalForDb.appDb) return globalForDb.appDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(url, {
    // TLS, verifying the pooler's certificate and hostname against Supabase's root CA
    // (postgres.js connects without TLS unless asked, and 'require' skips verification).
    ssl: LOCAL_HOSTS.has(new URL(url).hostname) ? false : { ca: SUPABASE_ROOT_CA },
    // The transaction pooler cannot hold prepared statements across transactions.
    prepare: false,
    // Each serverless instance keeps a small pool; the pooler's client limit
    // (600 on Medium compute) is shared by every instance.
    max: 3,
    // Close idle connections quickly so suspended instances do not hold pooler slots.
    idle_timeout: 20,
    // Fail fast when the pooler is unreachable.
    connect_timeout: 5,
    // Drizzle names nested subqueries by joining relation names, and the longest
    // (…_custom_equipment_custom_weapon_profiles) pass Postgres's 63-character limit.
    // Postgres truncates them with a notice each time, about 60 log lines per roster
    // read. The truncated names stay unique, so skip only that notice.
    onnotice: (notice) => {
      if (notice.code !== '42622') console.log(notice);
    },
  });

  globalForDb.appDb = drizzle(client, { schema });
  return globalForDb.appDb;
}

/**
 * Runs `read` in a transaction where auth.uid() is `userId`, so policies that
 * check it apply as they do over the Data API. The claims last only for the
 * transaction, so the pooled connection is not left signed in as the user.
 * `userId` must be the authenticated caller's own id.
 */
export function withUserClaims<T>(userId: string, read: (tx: AppTx) => Promise<T>): Promise<T> {
  return getAppDb().transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    return read(tx);
  });
}
