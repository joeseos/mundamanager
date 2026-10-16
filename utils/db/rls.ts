import 'server-only';

import { sql } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAppDb, type AppDatabase } from './client';

export type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

/**
 * Run queries as the signed-in user, the same way the Data API does it: the
 * user's verified JWT claims go into request.jwt.claims (read by auth.uid())
 * and the role switches to `authenticated`, so every RLS policy applies
 * unchanged.
 *
 * The claims come from supabase.auth.getClaims() on the request's own client,
 * which verifies the token. Both settings are transaction-local
 * (set_config(..., true) and SET LOCAL), so nothing carries over to the next
 * user of the pooled connection. There is deliberately no fallback to anon or
 * to the connection's own role: without a signed-in user this throws.
 */
export async function withRls<T>(
  supabase: SupabaseClient,
  run: (tx: AppTransaction) => Promise<T>
): Promise<T> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || claims?.role !== 'authenticated' || typeof claims.sub !== 'string' || !claims.sub) {
    throw new Error('withRls requires a signed-in user');
  }

  return getAppDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return run(tx);
  });
}
