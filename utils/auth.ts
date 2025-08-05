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

export async function checkAdmin(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role')
    .eq('id', user.id)
    .single();

  return profile?.user_role === 'admin';
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