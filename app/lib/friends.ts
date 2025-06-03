'use server';

import { createClient } from '@/utils/supabase/server';

export async function getAcceptedFriends(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('friends')
    .select('requester_id, addressee_id, status, profiles:requester_id(id, username, updated_at, user_role), addressee_profile:addressee_id(id, username, updated_at, user_role)')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => {
    let friendProfile;
    if (row.requester_id === userId) {
      friendProfile = row.addressee_profile;
    } else {
      friendProfile = row.profiles;
    }
    return {
      id: friendProfile.id,
      username: friendProfile.username,
      profile: {
        id: friendProfile.id,
        username: friendProfile.username,
        updated_at: friendProfile.updated_at ?? '',
        user_role: friendProfile.user_role ?? 'user',
      }
    };
  });
}

export async function getFriendsAndRequests(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('friends')
    .select('requester_id, addressee_id, status, profiles:requester_id(id, username, updated_at, user_role), addressee_profile:addressee_id(id, username, updated_at, user_role)')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .in('status', ['accepted', 'pending']);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => {
    let friendProfile, direction;
    if (row.requester_id === userId) {
      friendProfile = row.addressee_profile;
      direction = 'outgoing';
    } else {
      friendProfile = row.profiles;
      direction = 'incoming';
    }
    return {
      id: friendProfile.id,
      username: friendProfile.username,
      profile: {
        id: friendProfile.id,
        username: friendProfile.username,
        updated_at: friendProfile.updated_at ?? '',
        user_role: friendProfile.user_role ?? 'user',
      },
      status: row.status,
      direction,
    };
  });
} 