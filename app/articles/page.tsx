import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ForumArticleCard } from '@/components/forum/forum-article-card';
import { getForumArticles } from '@/app/lib/forum';

export const metadata: Metadata = {
  title: 'Articles - Munda Manager',
  description: 'Stories, guides and battle reports from the Munda Manager community.',
};

export default async function ArticlesPage() {
  const articles = await getForumArticles();
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

        <div className="bg-card shadow-md rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <h2 className="font-bold">Have a story to share?</h2>
            <p className="text-sm text-muted-foreground">
              Start a forum thread, then submit it for publication from the ... menu on the thread.
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
