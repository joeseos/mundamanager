import { SupabaseClient } from '@supabase/supabase-js'

interface AuthUser {
  id: string;
  email?: string;
}

export async function getAuthenticatedUser(supabase: SupabaseClient): Promise<AuthUser> {
  // Use optimized getClaims() for fast JWT verification
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    throw new Error('User not authenticated');
  }

  // Extract user information from JWT claims
  return {
    id: claimsData.claims.sub as string,
    email: claimsData.claims.email as string,
  };
}

// Simple helper for API routes that only need user ID
export async function getUserIdFromClaims(supabase: SupabaseClient): Promise<string | null> {
  const { data: claimsData } = await supabase.auth.getClaims();
  return claimsData?.claims?.sub || null;
}

export async function checkAdmin(supabase: SupabaseClient, user?: AuthUser) {
  try {
    const authUser = user || await getAuthenticatedUser(supabase);

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', authUser.id)
      .single();

    return profile?.user_role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Validates a user-supplied post-login redirect target to prevent open
 * redirects, returning a safe same-origin relative path (falling back to "/").
 *
 * Per OWASP guidance we parse with the URL API rather than string checks: a
 * naive `startsWith("/")` test misses bypasses such as "/\evil.com", which
 * browsers normalise to the protocol-relative "//evil.com". Resolving against
 * a fixed dummy origin and requiring the result to stay on that origin rejects
 * protocol-relative, absolute and backslash-based inputs alike.
 */
export function safeInternalPath(path?: string | null): string {
  if (!path) return "/";
  try {
    const base = "http://internal.invalid";
    const url = new URL(path, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}