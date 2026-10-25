import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  FORUM_THREADS_PER_PAGE,
  forumPageCount,
  forumTagPath,
  getForumTag,
  getForumTagThreads,
  parseForumPage,
} from '@/app/lib/forum';
import { ForumPagination } from '@/components/forum/forum-pagination';
import { ForumThreadRow } from '@/components/forum/forum-thread-row';

interface ForumTagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

export async function generateMetadata({ params }: ForumTagPageProps): Promise<Metadata> {
  const tag = await getForumTag((await params).tag);
  if (!tag) return {};
  return { title: `${tag.name} - Forum - Munda Manager` };
}

export default async function ForumTagPage({ params, searchParams }: ForumTagPageProps) {
  const [{ tag: slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const tag = await getForumTag(slug);
  const page = parseForumPage(pageParam);
  if (!tag || page === null) notFound();

  // Checked before the read so out-of-range pages add no cache entries
  const pageCount = forumPageCount(tag.thread_count, FORUM_THREADS_PER_PAGE);
  if (page > pageCount) notFound();

  const threads = await getForumTagThreads(tag.id, page);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-card shadow-md rounded-lg p-4">
        <h1 className="text-2xl font-bold">{tag.name}</h1>
        <p className="text-muted-foreground">Threads tagged {tag.name}, from every category.</p>

        {threads.length === 0 ? (
          <p className="text-muted-foreground italic text-center mt-4">No threads with this tag yet.</p>
        ) : (
          <ul className="divide-y mt-4">
            {threads.map((thread) => (
              <ForumThreadRow key={thread.number} thread={thread} categorySlug={thread.category_slug} />
            ))}
          </ul>
        )}

        <ForumPagination path={forumTagPath(tag.slug)} page={page} pageCount={pageCount} />
      </div>
    </main>
  );
}
