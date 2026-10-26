'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useClaims } from '@/hooks/use-claims';
import { isForumModeratorRole } from '@/utils/auth';
import { getForumArticleQueueEntries } from '@/app/actions/forum';

/** Moderators only: threads their authors suggested, answered on the thread itself. */
export function ForumArticleQueue() {
  const { userId, profile } = useClaims();
  const { data: queue } = useQuery({
    queryKey: ['forum-article-queue', userId],
    queryFn: getForumArticleQueueEntries,
    enabled: isForumModeratorRole(profile?.user_role),
  });
  if (!queue) return null;

  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <h2 className="text-xl md:text-2xl font-bold mb-4">Awaiting review</h2>
      <ul className="divide-y">
        {queue.length ? (
          queue.map((item) => (
            <li key={item.number} className="py-2 first:pt-0 last:pb-0 text-sm">
              <Link href={item.path} prefetch={false} className="font-semibold hover:text-red-800 transition-colors">
                {item.title}
              </Link>
              <p className="text-muted-foreground">
                {item.author ?? 'Unknown User'} · submitted {item.submitted}
              </p>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted-foreground italic">Nothing is awaiting review.</li>
        )}
      </ul>
    </div>
  );
}
