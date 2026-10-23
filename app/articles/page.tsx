import { Metadata } from 'next';
import Link from 'next/link';
import { formatArticleDate, getPublishedArticles } from '@/app/lib/articles';

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

const PAGE_TITLE = 'Articles - Munda Manager';
const PAGE_DESCRIPTION = 'News, feature announcements and articles from the Munda Manager team.';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: `${defaultUrl}/articles`,
    type: 'website',
    siteName: 'Munda Manager',
  },
  alternates: {
    canonical: `${defaultUrl}/articles`,
  },
};

export default async function ArticlesPage() {
  const articles = await getPublishedArticles();

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-card shadow-md rounded-lg p-4">
        <h1 className="text-2xl font-bold mb-4">Articles</h1>

        {articles.length === 0 ? (
          <p className="text-muted-foreground italic text-center">No articles yet.</p>
        ) : (
          <ul className="divide-y">
            {articles.map((article) => (
              <li key={article.slug} className="py-4 first:pt-0 last:pb-0">
                <Link href={`/articles/${article.slug}`} prefetch={false} className="group block">
                  <h2 className="text-xl font-semibold group-hover:text-red-800 transition-colors">
                    {article.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">{formatArticleDate(article.published_at)}</p>
                  {article.summary && <p className="mt-1">{article.summary}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
