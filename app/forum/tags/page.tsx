import { Metadata } from 'next';
import Link from 'next/link';
import { forumTagPath, getForumTags } from '@/app/lib/forum';
import { ForumAddTagButton, ForumTagActions } from '@/components/forum/forum-tag-admin';

// Rendered per request, like the forum index: the build can't read the forum
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tags - Forum - Munda Manager',
  description: 'Forum threads by topic, from every category.',
};

export default async function ForumTagsPage() {
  const tags = await getForumTags();

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-card shadow-md rounded-lg p-4">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Tags</h1>
            <p className="text-muted-foreground">Threads by topic, from every category.</p>
          </div>
          <ForumAddTagButton />
        </div>

        <ul className="divide-y">
          {tags.length ? (
            tags.map((tag) => (
              <li key={tag.id} className="group relative py-2 first:pt-0 last:pb-0 flex items-center gap-4">
                <Link
                  href={forumTagPath(tag.slug)}
                  prefetch={false}
                  className="flex-1 min-w-0 truncate font-semibold group-hover:text-red-800 transition-colors after:absolute after:inset-0"
                >
                  {tag.name}
                </Link>
                <span className="text-sm text-muted-foreground shrink-0">
                  {tag.thread_count} {tag.thread_count === 1 ? 'thread' : 'threads'}
                </span>
                <ForumTagActions tag={tag} />
              </li>
            ))
          ) : (
            <li className="text-muted-foreground italic text-center">No tags yet.</li>
          )}
        </ul>
      </div>
    </main>
  );
}
