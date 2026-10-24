import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { LuLock, LuPin } from 'react-icons/lu';
import {
  FORUM_POSTS_PER_PAGE,
  formatForumDate,
  formatForumReplies,
  getForumCategories,
  forumPageCount,
  forumThreadPath,
  getForumLikedPostIds,
  getForumPosts,
  getForumThread,
  parseForumPage,
  parseForumThreadNumber,
} from '@/app/lib/forum';
import { ForumPagination } from '@/components/forum/forum-pagination';
import { ForumPostContent } from '@/components/forum/forum-post-content';
import { ForumReplyBox } from '@/components/forum/forum-reply-box';
import { ForumThreadModeration } from '@/components/forum/forum-thread-moderation';
import { PatreonSupporterIcon } from '@/components/ui/patreon-supporter-icon';
import { UserAvatar } from '@/components/ui/user-avatar';
import { UserRoleBadge } from '@/components/ui/user-role-badge';
import { createClient } from '@/utils/supabase/server';
import { getUserIdFromClaims } from '@/utils/auth';
import '@/components/ui/rich-text-editor.css';

interface ForumThreadPageProps {
  params: Promise<{ category: string; thread: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

async function findThread(segment: string) {
  const number = parseForumThreadNumber(segment);
  return number === null ? null : getForumThread(number);
}

export async function generateMetadata({ params }: ForumThreadPageProps): Promise<Metadata> {
  const thread = await findThread((await params).thread);
  if (!thread) return {};
  return { title: `${thread.title} - ${thread.category.name} - Munda Manager` };
}

export default async function ForumThreadPage({ params, searchParams }: ForumThreadPageProps) {
  const [{ category: categorySlug, thread: segment }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const thread = await findThread(segment);
  const page = parseForumPage(pageParam);
  if (!thread || page === null) notFound();

  // A moved or renamed thread keeps its number, so old links land on the current URL.
  const path = forumThreadPath(thread.category.slug, thread.number, thread.title);
  if (path !== `/forum/${categorySlug}/${segment}`) {
    permanentRedirect(page === 1 ? path : `${path}?page=${page}`);
  }

  const pageCount = forumPageCount(thread.post_count, FORUM_POSTS_PER_PAGE);
  if (page > pageCount) notFound();

  const [posts, userId, categories] = await Promise.all([
    getForumPosts(thread, page),
    createClient().then(getUserIdFromClaims),
    getForumCategories(),
  ]);
  const likedPostIds = userId ? await getForumLikedPostIds(userId, posts.map((post) => post.id)) : new Set<string>();
  const pagePath = page === 1 ? path : `${path}?page=${page}`;

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-card shadow-md rounded-lg p-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 min-w-0">
            {thread.is_pinned && <LuPin className="h-5 w-5 shrink-0 text-red-800" aria-label="Pinned" />}
            {thread.is_locked && <LuLock className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="Locked" />}
            <span className="min-w-0 break-words">{thread.title}</span>
          </h1>
          <ForumThreadModeration
            threadId={thread.id}
            isPinned={thread.is_pinned}
            isLocked={thread.is_locked}
            categoryId={thread.category.id}
            categories={categories.map(({ id, name }) => ({ id, name }))}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {thread.author ?? 'Unknown User'} · {formatForumDate(thread.created_at)} · {formatForumReplies(thread.post_count)}
        </p>

        <ForumReplyBox threadId={thread.id} path={pagePath} locked={thread.is_locked}>
          <ol className="divide-y mt-4">
            {posts.map((post) => (
              <li
                key={post.id}
                id={`post-${post.post_number}`}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 sm:gap-x-3 py-4 first:pt-0 last:pb-0 scroll-mt-24"
              >
                {/* Beside the name on mobile, a column of its own from sm up */}
                <UserAvatar
                  username={post.author}
                  avatarUrl={post.author_avatar_url}
                  className="size-8 text-xs self-center sm:size-12 sm:text-base sm:self-start sm:row-span-2"
                />
                <div className="flex items-baseline justify-between gap-2 text-sm self-center sm:self-start">
                  <span className="min-w-0 truncate">
                    {post.author_id && post.author ? (
                      <Link href={`/user/${post.author_id}`} prefetch={false} className="font-semibold hover:text-red-800 transition-colors">
                        {post.author}
                      </Link>
                    ) : (
                      <span className="font-semibold">Unknown User</span>
                    )}
                    {post.author_patreon_tier_id && (
                      <span className="inline-block align-[-2px] ml-1">
                        <PatreonSupporterIcon
                          patreonTierId={post.author_patreon_tier_id}
                          patreonTierTitle={post.author_patreon_tier_title}
                        />
                      </span>
                    )}
                    <UserRoleBadge role={post.author_role} className="ml-1.5 px-1.5 py-0 text-[10px] align-[1px]" />
                    <span className="text-muted-foreground">
                      {' '}· {formatForumDate(post.created_at)}
                      {post.updated_at && !post.is_removed && ' · edited'}
                    </span>
                  </span>
                  <a href={`#post-${post.post_number}`} className="text-muted-foreground hover:text-red-800 shrink-0">
                    #{post.post_number}
                  </a>
                </div>
                <div className="col-span-2 sm:col-span-1 sm:col-start-2 min-w-0 mt-2">
                  {post.is_removed ? (
                    <p className="text-muted-foreground italic">This post was removed.</p>
                  ) : (
                    <ForumPostContent
                      post={post}
                      liked={likedPostIds.has(post.id)}
                      canLike={userId !== null && userId !== post.author_id}
                      threadTitle={thread.title}
                      pagePath={pagePath}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>

          <ForumPagination path={path} page={page} pageCount={pageCount} />
        </ForumReplyBox>
      </div>
    </main>
  );
}
