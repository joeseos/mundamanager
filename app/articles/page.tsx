import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ForumArticleCard } from '@/components/forum/forum-article-card';
import {
  formatForumDate,
  forumThreadPath,
  getForumArticleQueue,
  getForumArticles,
  type ForumArticleQueueItem,
} from '@/app/lib/forum';
import { createClient } from '@/utils/supabase/server';
import { getClaims, isForumModeratorRole } from '@/utils/auth';

// Rendered per request: DATABASE_URL only exists at runtime, so the build can't
// read the articles. getForumArticles() is cached, so a request doesn't hit the database.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Articles - Munda Manager',
  description: 'Stories, guides and battle reports from the Munda Manager community.',
};

export default async function ArticlesPage() {
  const [articles, claims] = await Promise.all([getForumArticles(), createClient().then(getClaims)]);
  const queue = claims && isForumModeratorRole(claims.profile?.user_role) ? await getForumArticleQueue(claims.userId) : null;
  const [hero, ...latest] = articles;

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
          <h1 className="text-2xl font-bold">Articles</h1>
          <p className="text-muted-foreground">Stories, guides and battle reports from the community.</p>

          <div className="mt-4">
            {hero ? (
              <ForumArticleCard article={hero} featured />
            ) : (
              <p className="text-muted-foreground italic">No articles yet.</p>
            )}
          </div>
        </div>

        {latest.length > 0 && (
          <div className="bg-card shadow-md rounded-lg p-4">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Latest articles</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {latest.map((article) => (
                <ForumArticleCard key={article.number} article={article} />
              ))}
            </div>
          </div>
        )}

        {queue && <ArticleQueue queue={queue} />}

        <div className="bg-card shadow-md rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <h2 className="font-bold">Have a story to share?</h2>
            <p className="text-sm text-muted-foreground">
              Start a forum thread, then submit it for publication from the thread.
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/forum" prefetch={false}>Go to the forum</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

/** Moderators only: threads their authors suggested, answered on the thread itself. */
function ArticleQueue({ queue }: { queue: ForumArticleQueueItem[] }) {
  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <h2 className="text-xl md:text-2xl font-bold mb-4">Awaiting review</h2>
      <ul className="divide-y">
        {queue.length ? (
          queue.map((item) => (
            <li key={item.number} className="py-2 first:pt-0 last:pb-0 text-sm">
              <Link
                href={forumThreadPath(item.category_slug, item.number, item.title)}
                prefetch={false}
                className="font-semibold hover:text-red-800 transition-colors"
              >
                {item.title}
              </Link>
              <p className="text-muted-foreground">
                {item.author ?? 'Unknown User'} · submitted {formatForumDate(item.submitted_at)}
              </p>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted-foreground italic">Nothing is awaiting review.</li>
        )}
      </ul>
    </div>
  );
}
