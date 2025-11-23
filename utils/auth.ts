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

export async function checkAdmin(supabase: SupabaseClient) {
  try {
    const user = await getAuthenticatedUser(supabase);

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    return profile?.user_role === 'admin';
  } catch {
    return false;
  }
}

export async function checkAdminOptimized(supabase: SupabaseClient, user?: AuthUser) {
  // Use provided user or get optimized user
  const authUser = user || await getAuthenticatedUser(supabase);

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role')
    .eq('id', authUser.id)
    .single();

  return profile?.user_role === 'admin';
} 