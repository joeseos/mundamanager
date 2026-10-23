import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LuLock, LuPin } from 'react-icons/lu';
import {
  FORUM_THREADS_PER_PAGE,
  formatForumDate,
  forumCategoryPath,
  forumPageCount,
  forumThreadPath,
  getForumCategory,
  getForumThreads,
  parseForumPage,
} from '@/app/lib/forum';
import { ForumPagination } from '@/components/forum/forum-pagination';

interface ForumCategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

export async function generateMetadata({ params }: ForumCategoryPageProps): Promise<Metadata> {
  const category = await getForumCategory((await params).category);
  if (!category) return {};
  return {
    title: `${category.name} - Forum - Munda Manager`,
    description: category.description ?? undefined,
  };
}

export default async function ForumCategoryPage({ params, searchParams }: ForumCategoryPageProps) {
  const [{ category: slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const category = await getForumCategory(slug);
  const page = parseForumPage(pageParam);
  if (!category || page === null) notFound();

  // Checked before the read so out-of-range pages add no cache entries
  const pageCount = forumPageCount(category.thread_count, FORUM_THREADS_PER_PAGE);
  if (page > pageCount) notFound();

  const threads = await getForumThreads(category.id, page);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-card shadow-md rounded-lg p-4">
        <h1 className="text-2xl font-bold">{category.name}</h1>
        {category.description && <p className="text-muted-foreground">{category.description}</p>}

        {threads.length === 0 ? (
          <p className="text-muted-foreground italic text-center mt-4">No threads yet.</p>
        ) : (
          <ul className="divide-y mt-4">
            {threads.map((thread) => {
              const replies = Math.max(thread.post_count - 1, 0);
              return (
                <li
                  key={thread.number}
                  className="group relative py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {thread.is_pinned && <LuPin className="h-4 w-4 shrink-0 text-red-800" aria-label="Pinned" />}
                      {thread.is_locked && <LuLock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Locked" />}
                      <Link
                        href={forumThreadPath(category.slug, thread.number, thread.title)}
                        prefetch={false}
                        className="font-semibold truncate group-hover:text-red-800 transition-colors after:absolute after:inset-0"
                      >
                        {thread.title}
                      </Link>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {thread.author ?? 'Unknown User'} · {formatForumDate(thread.created_at)}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground sm:w-24 sm:text-right shrink-0">
                    {replies} {replies === 1 ? 'reply' : 'replies'}
                  </div>
                  <div className="text-sm text-muted-foreground sm:w-48 min-w-0 shrink-0 truncate">
                    Last post by {thread.last_post_author ?? 'Unknown User'} · {formatForumDate(thread.last_post_at)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <ForumPagination path={forumCategoryPath(category.slug)} page={page} pageCount={pageCount} />
      </div>
    </main>
  );
}
