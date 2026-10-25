import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  FORUM_THREADS_PER_PAGE,
  forumCategoryPath,
  forumPageCount,
  getForumCategory,
  getForumThreads,
  parseForumPage,
} from '@/app/lib/forum';
import { ForumPagination } from '@/components/forum/forum-pagination';
import { ForumNewThreadButton } from '@/components/forum/forum-new-thread';
import { ForumThreadRow } from '@/components/forum/forum-thread-row';

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
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{category.name}</h1>
            {category.description && <p className="text-muted-foreground">{category.description}</p>}
          </div>
          <ForumNewThreadButton category={category} categoryPath={forumCategoryPath(category.slug)} />
        </div>

        {threads.length === 0 ? (
          <p className="text-muted-foreground italic text-center mt-4">No threads yet.</p>
        ) : (
          <ul className="divide-y mt-4">
            {threads.map((thread) => (
              <ForumThreadRow key={thread.number} thread={thread} categorySlug={category.slug} />
            ))}
          </ul>
        )}

        <ForumPagination path={forumCategoryPath(category.slug)} page={page} pageCount={pageCount} />
      </div>
    </main>
  );
}
