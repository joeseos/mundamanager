import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatArticleDate, getPublishedArticle } from '@/app/lib/articles';
import { PREPARED_CONTENT_CLASS_NAME, prepareUserGuideContent } from '@/utils/user-guide-content';
import '@/components/ui/rich-text-editor.css';

const defaultUrl = process.env.NODE_ENV === 'development'
  ? "http://localhost:3000"
  : "https://www.mundamanager.com";

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

// No slugs are rendered at build time: each article page is rendered on its
// first visit and then served statically until invalidateArticles() runs.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticle(slug);
  if (!article) return {};

  const title = `${article.title} - Munda Manager`;
  const url = `${defaultUrl}/articles/${article.slug}`;
  return {
    title,
    description: article.summary ?? undefined,
    openGraph: {
      title,
      description: article.summary ?? undefined,
      url,
      type: 'article',
      publishedTime: article.published_at,
      siteName: 'Munda Manager',
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await getPublishedArticle(slug);
  if (!article) notFound();

  const { html } = prepareUserGuideContent(article.content);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <article className="w-full bg-card shadow-md rounded-lg p-4">
        <h1 className="text-2xl md:text-3xl font-bold">{article.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{formatArticleDate(article.published_at)}</p>
        <div className={PREPARED_CONTENT_CLASS_NAME} dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </main>
  );
}
