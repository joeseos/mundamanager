import Link from 'next/link';
import { LuHeart, LuLock, LuPin } from 'react-icons/lu';
import { ForumTagChips } from '@/components/forum/forum-tag-chips';
import { formatForumDate, formatForumReplies, forumThreadPath, type ForumThreadSummary } from '@/app/lib/forum';

/** A thread in a category or tag page's list. The whole row opens the thread. */
export function ForumThreadRow({ thread, categorySlug }: { thread: ForumThreadSummary; categorySlug: string }) {
  return (
    <li className="group relative py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {thread.is_pinned && <LuPin className="h-4 w-4 shrink-0 text-red-800" aria-label="Pinned" />}
          {thread.is_locked && <LuLock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Locked" />}
          <Link
            href={forumThreadPath(categorySlug, thread.number, thread.title)}
            prefetch={false}
            className="font-semibold truncate group-hover:text-red-800 transition-colors after:absolute after:inset-0"
          >
            {thread.title}
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          {thread.author ?? 'Unknown User'} · {formatForumDate(thread.created_at)}
          {thread.like_count > 0 && (
            <>
              {' '}· <LuHeart className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Likes" /> {thread.like_count}
            </>
          )}
        </p>
        <ForumTagChips tags={thread.tags} className="mt-1" />
      </div>
      <div className="text-sm text-muted-foreground sm:w-24 sm:text-right shrink-0">
        {formatForumReplies(thread.post_count)}
      </div>
      <div className="text-sm text-muted-foreground sm:w-48 min-w-0 shrink-0 truncate">
        Last post by {thread.last_post_author ?? 'Unknown User'} · {formatForumDate(thread.last_post_at)}
      </div>
    </li>
  );
}
