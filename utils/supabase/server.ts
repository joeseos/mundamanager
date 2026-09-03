import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { isQueryCountEnabled, makeCountingFetch } from './query-counter'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(isQueryCountEnabled() ? { global: { fetch: makeCountingFetch() } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * The request's Supabase client, built once and shared.
 *
 * Use this — not createClient() — in any server component that calls the cached
 * gang/fighter accessors in app/lib/shared/gang-data.ts. Those memoise per request
 * on their arguments, the client included, so a second createClient() in the same
 * request yields a different instance, misses the memo, and silently costs a
 * duplicate Redis round-trip plus a deserialize of the whole cache entry. The
 * parallel @breadcrumb slots are the case that bites: they render alongside the
 * page and used to build their own client.
 *
 * Safe to share: createClient closes over this request's cookies() store and reads
 * it lazily, so a shared client still observes cookie mutations. Outside a render
 * scope (route handlers) React's cache() falls through un-memoised, which just
 * restores the old per-call behaviour.
 */
export const getRequestClient = cache(createClient)

export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createSupabaseClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
