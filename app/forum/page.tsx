import { Metadata } from 'next';
import Link from 'next/link';
import { forumCategoryPath, forumThreadPath, getForumCategories } from '@/app/lib/forum';
import { ForumLastActivityDate } from '@/components/forum/forum-last-activity-date';

export const metadata: Metadata = {
  title: 'Forum - Munda Manager',
  description: 'Discuss Necromunda, share your projects and tell your stories.',
};

export default async function ForumPage() {
  const categories = await getForumCategories();

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-card shadow-md rounded-lg p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Forum</h1>
          <p className="text-muted-foreground">Discuss Necromunda, share your projects and tell your stories.</p>
        </div>

        <ul className="divide-y">
          {categories.map((category) => (
            <li
              key={category.id}
              className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
            >
              <div className="group relative flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex-1 min-w-0">
                  {/* Stretched over the category name and thread count, not the latest post */}
                  <Link
                    href={forumCategoryPath(category.slug)}
                    prefetch={false}
                    className="text-lg font-semibold group-hover:text-red-800 transition-colors after:absolute after:inset-0"
                  >
                    {category.name}
                  </Link>
                  {category.description && (
                    <p className="text-sm text-muted-foreground">{category.description}</p>
                  )}
                </div>
                <div className={`text-sm text-muted-foreground sm:w-24 sm:text-right shrink-0 ${category.thread_count > 0 ? '' : 'hidden sm:block'}`}>
                  {category.thread_count > 0 && (
                    <>
                      {category.thread_count} {category.thread_count === 1 ? 'thread' : 'threads'}
                    </>
                  )}
                </div>
              </div>
              <div className="text-sm sm:w-72 min-w-0 shrink-0">
                {category.latest_thread ? (
                  <>
                    <Link
                      href={forumThreadPath(category.slug, category.latest_thread.number, category.latest_thread.title)}
                      prefetch={false}
                      className="relative block truncate hover:text-red-800 transition-colors"
                    >
                      {category.latest_thread.title}
                    </Link>
                    <p className="text-muted-foreground truncate">
                      {category.latest_thread.last_post_author ?? 'Unknown User'}
                      {' · '}
                      <ForumLastActivityDate date={category.latest_thread.last_post_at} />
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground italic">No threads yet</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
