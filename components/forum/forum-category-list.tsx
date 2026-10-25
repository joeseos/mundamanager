import Link from 'next/link';
import type { ForumCategory } from '@/app/lib/forum';
import { formatForumDate, forumCategoryPath, forumThreadPath } from '@/utils/forum';

/** The forum's categories with their thread counts and newest threads, on /forum and the home page. */
export function ForumCategoryList({ categories }: { categories: ForumCategory[] }) {
  return (
    <ul className="divide-y">
      {categories.map((category) => (
        <li
          key={category.id}
          className="group relative py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
        >
          <div className="flex-1 min-w-0">
            {/* Stretched over the whole row, so the row opens the category */}
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
          <div className="text-sm text-muted-foreground sm:w-24 sm:text-right shrink-0">
            {category.thread_count} {category.thread_count === 1 ? 'thread' : 'threads'}
          </div>
          <div className="text-sm sm:w-64 min-w-0 shrink-0">
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
                  {category.latest_thread.last_post_author ?? 'Unknown User'} ·{' '}
                  {formatForumDate(category.latest_thread.last_post_at)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground italic">No threads yet</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
