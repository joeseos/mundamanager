import { SupabaseClient } from '@supabase/supabase-js';

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
