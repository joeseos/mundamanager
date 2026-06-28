'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

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

  revalidateTag(CACHE_TAGS.USER_FRIENDS(requester_id), { expire: 0 });
  revalidateTag(CACHE_TAGS.USER_FRIENDS(addressee_id), { expire: 0 });

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

  revalidateTag(CACHE_TAGS.USER_FRIENDS(requester_id), { expire: 0 });
  revalidateTag(CACHE_TAGS.USER_FRIENDS(addressee_id), { expire: 0 });

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

  revalidateTag(CACHE_TAGS.USER_FRIENDS(userId), { expire: 0 });
  revalidateTag(CACHE_TAGS.USER_FRIENDS(friendId), { expire: 0 });

  return { success: true };
} 