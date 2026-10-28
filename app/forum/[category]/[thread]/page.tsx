import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LuLock, LuPin } from 'react-icons/lu';
import {
  FORUM_POSTS_PER_PAGE,
  formatForumDate,
  formatForumReplies,
  forumArticlePath,
  forumPageCount,
  forumPageHref,
  forumThreadPath,
  getForumPosts,
  getForumThread,
  parseForumPage,
  parseForumThreadNumber,
  type ForumPost,
  type ForumThread,
} from '@/app/lib/forum';
import { ForumPagination } from '@/components/forum/forum-pagination';
import { ForumPostContent } from '@/components/forum/forum-post-content';
import { ForumReplyBox } from '@/components/forum/forum-reply-box';
import { ForumTagChips } from '@/components/forum/forum-tag-chips';
import { ForumArticleSuggestion, ForumThreadMenu } from '@/components/forum/forum-thread-menu';
import { ForumMarkThreadRead, ForumThreadViewerProvider } from '@/components/forum/forum-viewer';
import { PatreonSupporterIcon } from '@/components/ui/patreon-supporter-icon';
import { UserAvatar } from '@/components/ui/user-avatar';
import { UserRoleBadge } from '@/components/ui/user-role-badge';
import '@/components/ui/rich-text-editor.css';

function ForumThreadHeading({ thread }: { thread: ForumThread }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 min-w-0">
        {thread.is_pinned && <LuPin className="h-5 w-5 shrink-0 text-red-800" aria-label="Pinned" />}
        {thread.is_locked && <LuLock className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="Locked" />}
        <span className="min-w-0 break-words">{thread.title}</span>
      </h1>
      <ForumThreadMenu
        threadId={thread.id}
        isPinned={thread.is_pinned}
        isLocked={thread.is_locked}
        isArticle={thread.article_published_at !== null}
        categoryId={thread.category.id}
        tagIds={thread.tags.map((tag) => tag.id)}
      />
    </div>
  );
}

/** The author's name, role and post number. The opening post puts the time on its own line. */
function ForumPostByline({ post, opening = false }: { post: ForumPost; opening?: boolean }) {
  const edited = post.updated_at && !post.is_removed ? ' · edited' : null;
  const name = (
    <>
      {post.author_id && post.author ? (
        <Link href={`/user/${post.author_id}`} prefetch={false} className="font-semibold hover:text-red-800 transition-colors">
          {post.author}
        </Link>
      ) : (
        <span className="font-semibold">Unknown User</span>
      )}
      {post.author_patreon_tier_id && (
        opening ? (
          <PatreonSupporterIcon patreonTierId={post.author_patreon_tier_id} patreonTierTitle={post.author_patreon_tier_title} />
        ) : (
          <span className="inline-block align-[-2px] ml-1">
            <PatreonSupporterIcon patreonTierId={post.author_patreon_tier_id} patreonTierTitle={post.author_patreon_tier_title} />
          </span>
        )
      )}
      <UserRoleBadge
        role={post.author_role}
        className={opening ? 'px-1.5 py-0 text-[10px]' : 'ml-1.5 px-1.5 py-0 text-[10px] align-[1px]'}
      />
    </>
  );
  const number = (
    <a
      href={`#post-${post.post_number}`}
      className={`w-9 text-center shrink-0 hover:text-red-800 ${opening ? 'text-sm text-muted-foreground' : 'text-muted-foreground'}`}
    >
      #{post.post_number}
    </a>
  );

  if (opening) {
    return (
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{name}</p>
          {number}
        </div>
        <p className="text-sm text-muted-foreground">
          {formatForumDate(post.created_at, true)}
          {edited}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-baseline justify-between gap-2 text-sm self-center sm:self-start">
      <span className="min-w-0 truncate">
        {name}
        <span className="text-muted-foreground">
          {' '}· {formatForumDate(post.created_at)}
          {edited}
        </span>
      </span>
      {number}
    </div>
  );
}

/** Also renders page/[page], the thread's later pages. */
interface ForumThreadPageProps {
  params: Promise<{ category: string; thread: string; page?: string }>;
}

// None at build: each renders on its first visit, then is cached
export async function generateStaticParams() {
  return [];
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

export default async function ForumThreadPage({ params }: ForumThreadPageProps) {
  const { category: categorySlug, thread: segment, page: pageParam } = await params;
  const thread = await findThread(segment);
  const page = parseForumPage(pageParam);
  if (!thread || page === null) notFound();

  // A moved or renamed thread keeps its number, so old links land on the current URL (and /page/1 on the bare path)
  const path = forumThreadPath(thread.category.slug, thread.number, thread.title);
  const pagePath = forumPageHref(path, page);
  if (path !== `/forum/${categorySlug}/${segment}` || pageParam === '1') redirect(pagePath);

  const pageCount = forumPageCount(thread.post_count, FORUM_POSTS_PER_PAGE);
  if (page > pageCount) notFound();

  const posts = await getForumPosts(thread, page);
  const isFirstPage = page === 1;

  return (
    <main className="flex min-h-screen flex-col items-center">
      <ForumThreadViewerProvider threadNumber={thread.number} page={page} authorId={thread.author_id}>
        {page === pageCount && <ForumMarkThreadRead threadId={thread.id} threadNumber={thread.number} lastPostAt={thread.last_post_at} />}
        <div className="w-full bg-card shadow-md rounded-lg p-4">
          {!isFirstPage && (
            <>
              <ForumThreadHeading thread={thread} />
              <ForumTagChips tags={thread.tags} className="mt-1" badgeClassName="px-2 py-0.5 text-xs" />
              <p className="text-sm text-muted-foreground">
                {thread.author ?? 'Unknown User'} · {formatForumDate(thread.created_at)} · {formatForumReplies(thread.post_count)}
                {thread.article_published_at && (
                  <>
                    {' '}·{' '}
                    <Link href={forumArticlePath(thread.number, thread.title)} prefetch={false} className="hover:text-red-800 transition-colors">
                      Read as an article
                    </Link>
                  </>
                )}
              </p>
              <ForumArticleSuggestion />
            </>
          )}

          <ForumReplyBox threadId={thread.id} path={pagePath} locked={thread.is_locked} divider={pageCount <= 1}>
            {!isFirstPage && <ForumPagination path={path} page={page} pageCount={pageCount} className="border-b pb-4" />}
            <ol className={`divide-y ${isFirstPage ? '' : 'mt-4'}`}>
              {posts.map((post) => post.post_number === 1 ? (
                <li key={post.id} id={`post-${post.post_number}`} className="py-4 first:pt-0 last:pb-0 scroll-mt-24">
                  <ForumThreadHeading thread={thread} />
                  <div className="mt-1 flex items-start justify-between gap-2 text-sm text-muted-foreground">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <ForumTagChips tags={thread.tags} className="contents" badgeClassName="px-2 py-0.5 text-xs" />
                      <span>{formatForumReplies(thread.post_count)}</span>
                    </div>
                    {thread.article_published_at && (
                      <Link href={forumArticlePath(thread.number, thread.title)} prefetch={false} className="shrink-0 hover:text-red-800 transition-colors">
                        Read as an article
                      </Link>
                    )}
                  </div>
                  <ForumPagination path={path} page={page} pageCount={pageCount} className="border-b pb-4" />
                  <div className="mt-2 flex items-center gap-3">
                    <UserAvatar username={post.author} avatarUrl={post.author_avatar_url} className="size-18 text-lg" />
                    <ForumPostByline post={post} opening />
                  </div>
                  <ForumArticleSuggestion />
                  <div className="min-w-0 mt-2">
                    {post.is_removed ? (
                      <p className="text-sm text-muted-foreground italic">This post was removed.</p>
                    ) : (
                      <ForumPostContent post={post} threadTitle={thread.title} pagePath={pagePath} />
                    )}
                  </div>
                </li>
              ) : (
                <li
                  key={post.id}
                  id={`post-${post.post_number}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 sm:gap-x-3 py-4 first:pt-0 last:pb-0 scroll-mt-24"
                >
                  {/* Beside the name on mobile, a column of its own from sm up */}
                  <UserAvatar
                    username={post.author}
                    avatarUrl={post.author_avatar_url}
                    className="size-12 text-sm self-center sm:size-16 sm:text-lg sm:self-start sm:row-span-2"
                  />
                  <ForumPostByline post={post} />
                  <div className="col-span-2 sm:col-span-1 sm:col-start-2 min-w-0 mt-2">
                    {post.is_removed ? (
                      <p className="text-sm text-muted-foreground italic">This post was removed.</p>
                    ) : (
                      <ForumPostContent
                        post={post}
                        threadTitle={thread.title}
                        pagePath={pagePath}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <ForumPagination path={path} page={page} pageCount={pageCount} className="border-t pt-4" />
          </ForumReplyBox>
        </div>
      </ForumThreadViewerProvider>
    </main>
  );
}
