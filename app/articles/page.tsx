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
import { getClaims } from '@/utils/auth';

// Rendered per request: DATABASE_URL only exists at runtime, so the build can't
// read the articles. getForumArticles() is cached, so a request doesn't hit the database.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Articles - Munda Manager',
  description: 'Stories, guides and battle reports from the Munda Manager community.',
};

interface ArticlesPageProps {
  searchParams: Promise<{ category?: string | string[] }>;
}

export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const [{ category }, articles, claims] = await Promise.all([
    searchParams,
    getForumArticles(),
    createClient().then(getClaims),
  ]);
  const role = claims?.profile?.user_role;
  const queue = claims && (role === 'admin' || role === 'moderator') ? await getForumArticleQueue(claims.userId) : null;

  // The categories that have articles, in the order their newest article was published
  const categories = [...new Map(articles.map((article) => [article.category.slug, article.category.name]))];
  const shown = typeof category === 'string' ? articles.filter((article) => article.category.slug === category) : articles;
  const [hero, ...latest] = shown;

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold">Articles</h1>
              <p className="text-muted-foreground">Stories, guides and battle reports from the community.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/forum" prefetch={false}>Visit the forum</Link>
            </Button>
          </div>

          {categories.length > 1 && (
            <nav className="flex flex-wrap gap-1 mt-4" aria-label="Article categories">
              <CategoryLink href="/articles" active={shown === articles} label="All articles" />
              {categories.map(([slug, name]) => (
                <CategoryLink key={slug} href={`/articles?category=${slug}`} active={category === slug} label={name} />
              ))}
            </nav>
          )}

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

function CategoryLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </Link>
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
