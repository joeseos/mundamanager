import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { TAGS } from '@/utils/cache-tags';
import { sanitizeArticleHtml } from '@/utils/sanitize-article-html';

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
 * Published articles, read with the anon key like getUserGuides(): the pages
 * are public and RLS only lets anon read published rows. Tag-driven: the admin
 * write path (/api/admin/articles) calls invalidateArticles() on publish,
 * unpublish and delete, so these can be cached indefinitely.
 *
 * Content is sanitized here, once per cache entry, rather than on save: RLS lets
 * an editor write the tables directly, past the API route.
 */
function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export const getPublishedArticles = unstable_cache(
  async (): Promise<PublishedArticleSummary[]> => {
    const { data, error } = await anonClient()
      .from('articles')
      .select('slug, title, summary, published_at, updated_at')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false });

    if (error) {
      console.error('Error fetching articles:', error);
      throw new Error(`Failed to fetch articles: ${error.message}`);
    }
    return (data ?? []) as PublishedArticleSummary[];
  },
  ['published-articles'],
  { tags: [TAGS.articles()], revalidate: false }
);

const getCachedPublishedArticle = unstable_cache(
  async (slug: string): Promise<PublishedArticle | null> => {
    const { data, error } = await anonClient()
      .from('articles')
      .select('slug, title, summary, content, published_at, updated_at')
      .eq('slug', slug)
      .not('published_at', 'is', null)
      .maybeSingle();

    if (error) {
      console.error('Error fetching article:', error);
      throw new Error(`Failed to fetch article: ${error.message}`);
    }
    return data ? { ...data, content: sanitizeArticleHtml(data.content) } as PublishedArticle : null;
  },
  ['published-article'],
  { tags: [TAGS.articles()], revalidate: false }
);

export async function getPublishedArticle(slug: string): Promise<PublishedArticle | null> {
  // Don't query or cache slugs that can't exist.
  if (!ARTICLE_SLUG_RE.test(slug)) return null;
  return getCachedPublishedArticle(slug);
}
