'use server';

import { invalidateUser } from '@/utils/cache-tags';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';

export async function acceptFriendRequest(requester_id: string, addressee_id: string) {
  const supabase = await createClient();

  await getAuthenticatedUser(supabase);
  const { error } = await supabase
    .from('friends')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('requester_id', requester_id)
    .eq('addressee_id', addressee_id);

  if (error) {
    throw new Error(error.message);
  }

  invalidateUser(requester_id);
  invalidateUser(addressee_id);

  return { success: true };
}

export async function declineFriendRequest(requester_id: string, addressee_id: string) {
  const supabase = await createClient();

  await getAuthenticatedUser(supabase);
  const { error } = await supabase
    .from('friends')
    .update({ status: 'blocked', updated_at: new Date().toISOString() })
    .eq('requester_id', requester_id)
    .eq('addressee_id', addressee_id);

  if (error) {
    throw new Error(error.message);
  }

  invalidateUser(requester_id);
  invalidateUser(addressee_id);

  return { success: true };
}

export async function sendFriendRequest(requesterId: string, addresseeId: string) {
  const supabase = await createClient();

  await getAuthenticatedUser(supabase);

  const { data: existing, error: checkError } = await supabase
    .from('friends')
    .select('id, status')
    .or(`and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`)
    .limit(1);

  if (checkError) throw new Error(checkError.message);
  if (existing && existing.length > 0) {
    return { success: false, error: 'already_exists' };
  }

  const { error } = await supabase
    .from('friends')
    .insert({
      requester_id: requesterId,
      addressee_id: addresseeId,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

  if (error) throw new Error(error.message);

  invalidateUser(requesterId);
  invalidateUser(addresseeId);

  return { success: true };
}

export async function deleteFriend(userId: string, friendId: string) {
  const supabase = await createClient();

  await getAuthenticatedUser(supabase);
  const { error } = await supabase
    .from('friends')
    .delete()
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`);

  if (error) {
    throw new Error(error.message);
  }

  invalidateUser(userId);
  invalidateUser(friendId);

  return { success: true };
} 