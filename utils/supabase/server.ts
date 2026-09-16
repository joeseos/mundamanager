import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
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

/**
 * Look up an auth user id by exact email address.
 *
 * auth.users is not exposed through PostgREST, so this goes via the GoTrue admin API.
 * Its `filter` param is a server-side substring match, so the exact address is confirmed
 * here before returning. Throws on a failed request so callers can distinguish an
 * infrastructure failure from "no such user" — returning null for both loses data.
 */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  const normalised = email.toLowerCase();
  const url = new URL('/auth/v1/admin/users', supabaseUrl);
  url.searchParams.set('per_page', '50');
  url.searchParams.set('filter', normalised);

  const response = await fetch(url, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });

  if (!response.ok) {
    throw new Error(`GoTrue admin user lookup failed: ${response.status} ${response.statusText}`);
  }

  const { users } = (await response.json()) as { users: Array<{ id: string; email?: string }> };

  return users.find(user => user.email?.toLowerCase() === normalised)?.id ?? null;
}
