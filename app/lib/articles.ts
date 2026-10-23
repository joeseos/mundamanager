import { unstable_cache } from 'next/cache';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import { articles } from '@/utils/db/schema';
import { TAGS } from '@/utils/cache-tags';
import { sanitizeArticleHtml } from '@/utils/sanitize-notification-html';

/** Same rule as the articles_slug_format check constraint. */
export const ARTICLE_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface PublishedArticleSummary {
  slug: string;
  title: string;
  summary: string | null;
  published_at: string;
  updated_at: string | null;
}

export interface PublishedArticle extends PublishedArticleSummary {
  content: string;
}

/**
 * Published articles, read over the direct connection like the reference data:
 * the pages are public, and RLS lets everyone read published rows. Tag-driven:
 * the admin write path (/api/admin/articles) calls invalidateArticles() on
 * publish, unpublish and delete, so these can be cached indefinitely.
 *
 * Content is sanitized here, once per cache entry, rather than on save: RLS lets
 * an editor write the table directly, past the API route.
 */
const SUMMARY_COLUMNS = {
  slug: articles.slug,
  title: articles.title,
  summary: articles.summary,
  published_at: sql<string>`to_json(${articles.published_at})`,
  updated_at: sql<string | null>`to_json(${articles.updated_at})`,
};

export const getPublishedArticles = unstable_cache(
  async (): Promise<PublishedArticleSummary[]> =>
    getAppDb()
      .select(SUMMARY_COLUMNS)
      .from(articles)
      .where(isNotNull(articles.published_at))
      .orderBy(desc(articles.published_at)),
  ['published-articles'],
  { tags: [TAGS.articles()], revalidate: false }
);

const getCachedPublishedArticle = unstable_cache(
  async (slug: string): Promise<PublishedArticle | null> => {
    const [article] = await getAppDb()
      .select({ ...SUMMARY_COLUMNS, content: articles.content })
      .from(articles)
      .where(and(eq(articles.slug, slug), isNotNull(articles.published_at)));
    return article ? { ...article, content: sanitizeArticleHtml(article.content) } : null;
  },
  ['published-article'],
  { tags: [TAGS.articles()], revalidate: false }
);

export async function getPublishedArticle(slug: string): Promise<PublishedArticle | null> {
  // Don't query or cache slugs that can't exist.
  if (!ARTICLE_SLUG_RE.test(slug)) return null;
  return getCachedPublishedArticle(slug);
}

/** "23 October 2026". Fixed locale and time zone so server and client render the same text. */
export function formatArticleDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
