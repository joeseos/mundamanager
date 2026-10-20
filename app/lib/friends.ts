import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { getAppDb } from '@/utils/db/client';

const profileColumns = { id: true, username: true, updated_at: true, user_role: true } as const;

export const getFriendsAndRequests = async (userId: string) => {
  return unstable_cache(
    async () => {
      const rows = await getAppDb().query.friends.findMany({
        columns: { requester_id: true, status: true },
        where: (friend, { and, eq, inArray, or }) =>
          and(
            or(eq(friend.requester_id, userId), eq(friend.addressee_id, userId)),
            inArray(friend.status, ['accepted', 'pending'])
          ),
        with: {
          requester: { columns: profileColumns },
          addressee: { columns: profileColumns },
        },
      });

      return rows.map((row) => {
        const outgoing = row.requester_id === userId;
        const friendProfile = outgoing ? row.addressee : row.requester;
        return {
          id: friendProfile.id,
          username: friendProfile.username,
          profile: {
            id: friendProfile.id,
            username: friendProfile.username,
            updated_at: friendProfile.updated_at,
            user_role: friendProfile.user_role ?? 'user',
          },
          status: row.status,
          direction: outgoing ? 'outgoing' : 'incoming',
        };
      });
    },
    [`user-friends-v2-${userId}`],
    {
      tags: [TAGS.user(userId)],
      revalidate: false
    }
  )();
};
