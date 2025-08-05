'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';

export async function acceptFriendRequest(requester_id: string, addressee_id: string) {
  const supabase = await createClient();
  
  // Authenticate user
  await getAuthenticatedUser(supabase);
  const { error } = await supabase
    .from('friends')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('requester_id', requester_id)
    .eq('addressee_id', addressee_id);

  if (error) {
    throw new Error(error.message);
  }
  return { success: true };
}

export async function declineFriendRequest(requester_id: string, addressee_id: string) {
  const supabase = await createClient();
  
  // Authenticate user
  await getAuthenticatedUser(supabase);
  const { error } = await supabase
    .from('friends')
    .update({ status: 'blocked', updated_at: new Date().toISOString() })
    .eq('requester_id', requester_id)
    .eq('addressee_id', addressee_id);

  if (error) {
    throw new Error(error.message);
  }
  return { success: true };
}

export async function deleteFriend(userId: string, friendId: string) {
  const supabase = await createClient();
  
  // Authenticate user
  await getAuthenticatedUser(supabase);
  // Remove the friend relationship in either direction
  const { error } = await supabase
    .from('friends')
    .delete()
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`);

  if (error) {
    throw new Error(error.message);
  }
  return { success: true };
} 