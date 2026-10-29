import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LuHeart, LuLock, LuPin } from 'react-icons/lu';
import {
  FORUM_POSTS_PER_PAGE,
  FORUM_THREADS_PER_PAGE,
  formatForumDate,
  forumCategoryPath,
  forumPageCount,
  forumPostHref,
  forumReplyCount,
  forumThreadPath,
  getForumCategory,
  getForumThreads,
  parseForumPage,
} from '@/app/lib/forum';
import { ForumPagination, ForumThreadPageLinks } from '@/components/forum/forum-pagination';
import { ForumRelativeTime } from '@/components/forum/forum-relative-time';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ForumNewThreadButton } from '@/components/forum/forum-new-thread';
import { ForumTagChips } from '@/components/forum/forum-tag-chips';
import { ForumThreadTitleLink, ForumUnreadThreadsProvider } from '@/components/forum/forum-viewer';

/** Also renders page/[page], the category's later pages. */
interface ForumCategoryPageProps {
  params: Promise<{ category: string; page?: string }>;
}

// None at build: each renders on its first visit, then is cached
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: ForumCategoryPageProps): Promise<Metadata> {
  const category = await getForumCategory((await params).category);
  if (!category) return {};
  return {
    title: `${category.name} - Forum - Munda Manager`,
    description: category.description ?? undefined,
  };
}

export default async function ForumCategoryPage({ params }: ForumCategoryPageProps) {
  const { category: slug, page: pageParam } = await params;
  const category = await getForumCategory(slug);
  const page = parseForumPage(pageParam);
  if (!category || page === null) notFound();

  if (pageParam === '1') redirect(forumCategoryPath(category.slug));

  // Checked before the read, so out-of-range pages add no data cache entries
  const pageCount = forumPageCount(category.thread_count, FORUM_THREADS_PER_PAGE);
  if (page > pageCount) notFound();

  const threads = await getForumThreads(category.id, page);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-card shadow-md rounded-lg p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            {category.icon_url && (
              // A category icon can be hosted anywhere, so not next/image
              // eslint-disable-next-line @next/next/no-img-element
              <img src={category.icon_url} alt="" className="mt-1 size-10 shrink-0 object-contain" />
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">{category.name}</h1>
              {category.description && <p className="text-muted-foreground">{category.description}</p>}
              <p className="text-sm text-muted-foreground">
                {category.thread_count} {category.thread_count === 1 ? 'thread' : 'threads'}
              </p>
            </div>
          </div>
          <ForumNewThreadButton category={category} categoryPath={forumCategoryPath(category.slug)} />
        </div>

        {threads.length === 0 ? (
          <p className="text-muted-foreground italic text-center mt-4">No threads yet.</p>
        ) : (
          <ForumUnreadThreadsProvider
            categoryId={category.id}
            page={page}
            threads={threads.map(({ number, last_post_at }) => ({ number, last_post_at }))}>
            <div className="mt-4 hidden sm:flex items-center gap-4 border-b pb-2 text-sm font-medium">
              <div className="flex flex-1 min-w-0 items-center gap-3">
                <div className="w-14 shrink-0" />
                <div className="min-w-0">Thread</div>
              </div>
              <div className="w-24 text-center shrink-0">Replies</div>
              <div className="w-48 min-w-0 shrink-0">Last Activity</div>
            </div>
            <ul className="divide-y mt-4 sm:mt-0">
              {threads.map((thread) => (
                <li
                  key={thread.number}
                  className="py-1.5 first:pt-0 sm:first:pt-1.5 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
                >
                  <div className="group relative flex flex-1 min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex flex-1 min-w-0 items-center gap-3">
                      <UserAvatar username={thread.author} avatarUrl={thread.author_avatar_url} className="size-14 text-base" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {thread.is_pinned && <LuPin className="h-4 w-4 shrink-0 text-red-800" aria-label="Pinned" />}
                          {thread.is_locked && <LuLock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Locked" />}
                          <ForumThreadTitleLink
                            number={thread.number}
                            href={forumThreadPath(category.slug, thread.number, thread.title)}
                            title={thread.title}
                          />
                          <ForumThreadPageLinks
                            path={forumThreadPath(category.slug, thread.number, thread.title)}
                            pageCount={forumPageCount(thread.post_count, FORUM_POSTS_PER_PAGE)}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <span>
                            {thread.author ?? 'Unknown User'} · {formatForumDate(thread.created_at, true)}
                            {thread.like_count > 0 && (
                              <>
                                {' '}· <LuHeart className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Likes" /> {thread.like_count}
                              </>
                            )}
                          </span>
                          <ForumTagChips tags={thread.tags} className="contents" />
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground sm:w-24 sm:text-center shrink-0">
                      {forumReplyCount(thread.post_count)}
                    </div>
                  </div>
                  <Link
                    href={forumPostHref(forumThreadPath(category.slug, thread.number, thread.title), thread.post_count)}
                    prefetch={false}
                    className="group/activity block text-sm text-muted-foreground sm:w-48 min-w-0 shrink-0"
                  >
                    <span className="block transition-colors group-hover/activity:text-red-800">
                      <ForumRelativeTime date={thread.last_post_at}>{formatForumDate(thread.last_post_at, true)}</ForumRelativeTime>
                    </span>
                    <p className="truncate">by {thread.last_post_author ?? 'Unknown User'}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </ForumUnreadThreadsProvider>
        )}

        <ForumPagination path={forumCategoryPath(category.slug)} page={page} pageCount={pageCount} className="border-t pt-4" />
      </div>
    </main>
  );
}
