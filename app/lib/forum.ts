import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { and, asc, between, desc, eq, sql } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { getAppDb } from '@/utils/db/client';
import { forumCategories, forumPosts, forumThreads, profiles } from '@/utils/db/schema';
import { TAGS } from '@/utils/cache-tags';
import { sanitizeArticleHtml } from '@/utils/sanitize-notification-html';
import { slugifyHeading } from '@/utils/user-guide-content';

export const FORUM_THREADS_PER_PAGE = 25;
export const FORUM_POSTS_PER_PAGE = 20;

export interface ForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  moderators_only: boolean;
  thread_count: number;
  latest_thread: {
    number: number;
    title: string;
    last_post_at: string;
    last_post_author: string | null;
  } | null;
}

export interface ForumThreadSummary {
  number: number;
  title: string;
  author: string | null;
  is_pinned: boolean;
  is_locked: boolean;
  post_count: number;
  created_at: string;
  last_post_at: string;
  last_post_author: string | null;
}

export interface ForumThread extends ForumThreadSummary {
  id: string;
  category: { id: string; slug: string; name: string };
}

export interface ForumPost {
  id: string;
  post_number: number;
  author_id: string | null;
  author: string | null;
  author_avatar_url: string | null;
  author_patreon_tier_id: string | null;
  author_patreon_tier_title: string | null;
  author_role: string | null;
  /** Sanitized HTML; empty once a moderator has removed the post. */
  content: string;
  is_removed: boolean;
  like_count: number;
  created_at: string;
  updated_at: string | null;
}

/**
 * Forum reads, over the direct connection like the articles and reference data:
 * the pages are public and RLS lets everyone read the forum tables. Each read
 * carries the tag its write path will bust (see utils/cache-tags.ts). Post
 * content is sanitized here, once per cache entry, because RLS lets any
 * signed-in user write posts directly, past the app.
 *
 * Timestamps go through to_json so they come back as ISO strings.
 */
const iso = (column: AnyPgColumn) => sql<string>`to_json(${column})`;

const author = alias(profiles, 'author');
const lastPostAuthor = alias(profiles, 'last_post_author');

/** Categories in index order, each with its most recently active thread. */
export const getForumCategories = unstable_cache(
  async (): Promise<ForumCategory[]> => {
    const latest = getAppDb()
      .select({
        number: forumThreads.number,
        title: forumThreads.title,
        latest_post_at: iso(forumThreads.last_post_at).as('latest_post_at'),
        last_post_author_id: forumThreads.last_post_author_id,
      })
      .from(forumThreads)
      .where(eq(forumThreads.category_id, forumCategories.id))
      .orderBy(desc(forumThreads.last_post_at))
      .limit(1)
      .as('latest');

    const rows = await getAppDb()
      .select({
        id: forumCategories.id,
        slug: forumCategories.slug,
        name: forumCategories.name,
        description: forumCategories.description,
        moderators_only: forumCategories.moderators_only,
        thread_count: forumCategories.thread_count,
        latest_number: latest.number,
        latest_title: latest.title,
        latest_last_post_at: latest.latest_post_at,
        latest_last_post_author: lastPostAuthor.username,
      })
      .from(forumCategories)
      .leftJoinLateral(latest, sql`true`)
      .leftJoin(lastPostAuthor, eq(lastPostAuthor.id, latest.last_post_author_id))
      .orderBy(asc(forumCategories.position), asc(forumCategories.name));

    return rows.map(({ latest_number, latest_title, latest_last_post_at, latest_last_post_author, ...category }) => ({
      ...category,
      latest_thread:
        latest_number === null
          ? null
          : {
              number: latest_number,
              title: latest_title!,
              last_post_at: latest_last_post_at!,
              last_post_author: latest_last_post_author,
            },
    }));
  },
  ['forum-categories'],
  { tags: [TAGS.forumIndex()], revalidate: 60 }
);

// cache(): a page, its metadata and its breadcrumb share one lookup per request
export const getForumCategory = cache(async (slug: string): Promise<ForumCategory | null> => {
  const categories = await getForumCategories();
  return categories.find((category) => category.slug === slug) ?? null;
});

const THREAD_SUMMARY_COLUMNS = {
  number: forumThreads.number,
  title: forumThreads.title,
  author: author.username,
  is_pinned: forumThreads.is_pinned,
  is_locked: forumThreads.is_locked,
  post_count: forumThreads.post_count,
  created_at: iso(forumThreads.created_at),
  last_post_at: iso(forumThreads.last_post_at),
  last_post_author: lastPostAuthor.username,
};

/** One page of a category's threads: pinned first, then by latest post. */
export function getForumThreads(categoryId: string, page: number): Promise<ForumThreadSummary[]> {
  return unstable_cache(
    async () =>
      getAppDb()
        .select(THREAD_SUMMARY_COLUMNS)
        .from(forumThreads)
        .leftJoin(author, eq(author.id, forumThreads.author_id))
        .leftJoin(lastPostAuthor, eq(lastPostAuthor.id, forumThreads.last_post_author_id))
        .where(eq(forumThreads.category_id, categoryId))
        .orderBy(desc(forumThreads.is_pinned), desc(forumThreads.last_post_at))
        .limit(FORUM_THREADS_PER_PAGE)
        .offset((page - 1) * FORUM_THREADS_PER_PAGE),
    ['forum-threads', categoryId, String(page)],
    { tags: [TAGS.forumCategory(categoryId)], revalidate: false }
  )();
}

// cache(): shared by the page, its metadata and its breadcrumb, as above
export const getForumThread = cache((number: number): Promise<ForumThread | null> =>
  unstable_cache(
    async () => {
      const [thread] = await getAppDb()
        .select({
          ...THREAD_SUMMARY_COLUMNS,
          id: forumThreads.id,
          category: {
            id: forumCategories.id,
            slug: forumCategories.slug,
            name: forumCategories.name,
          },
        })
        .from(forumThreads)
        .innerJoin(forumCategories, eq(forumCategories.id, forumThreads.category_id))
        .leftJoin(author, eq(author.id, forumThreads.author_id))
        .leftJoin(lastPostAuthor, eq(lastPostAuthor.id, forumThreads.last_post_author_id))
        .where(eq(forumThreads.number, number));
      return thread ?? null;
    },
    ['forum-thread', String(number)],
    { tags: [TAGS.forumThread(number)], revalidate: false }
  )()
);

/**
 * One page of a thread's posts, oldest first. Post numbers run 1, 2, 3... with
 * no gaps (posts are removed, never deleted), so a page is a range of them.
 * Refreshes every 60 s so like counts catch up without a bust on every like.
 */
export function getForumPosts(thread: Pick<ForumThread, 'id' | 'number'>, page: number): Promise<ForumPost[]> {
  return unstable_cache(
    async () => {
      const rows = await getAppDb()
        .select({
          id: forumPosts.id,
          post_number: forumPosts.post_number,
          author_id: forumPosts.author_id,
          author: author.username,
          author_avatar_url: author.avatar_url,
          author_patreon_tier_id: author.patreon_tier_id,
          author_patreon_tier_title: author.patreon_tier_title,
          author_role: author.user_role,
          content: forumPosts.content,
          deleted_at: forumPosts.deleted_at,
          like_count: forumPosts.like_count,
          created_at: iso(forumPosts.created_at),
          updated_at: sql<string | null>`to_json(${forumPosts.updated_at})`,
        })
        .from(forumPosts)
        .leftJoin(author, eq(author.id, forumPosts.author_id))
        .where(
          and(
            eq(forumPosts.thread_id, thread.id),
            between(forumPosts.post_number, (page - 1) * FORUM_POSTS_PER_PAGE + 1, page * FORUM_POSTS_PER_PAGE)
          )
        )
        .orderBy(asc(forumPosts.post_number));

      return rows.map(({ deleted_at, content, ...post }) => ({
        ...post,
        content: deleted_at ? '' : sanitizeArticleHtml(content),
        is_removed: deleted_at !== null,
      }));
    },
    ['forum-posts', String(thread.number), String(page)],
    { tags: [TAGS.forumThread(thread.number)], revalidate: 60 }
  )();
}

export function forumCategoryPath(categorySlug: string): string {
  return `/forum/${categorySlug}`;
}

/** /forum/<category slug>/<number>-<title slug>. Only the number identifies the thread. */
export function forumThreadPath(categorySlug: string, number: number, title: string): string {
  return `/forum/${categorySlug}/${number}-${slugifyHeading(title)}`;
}

/** The thread number from a `<number>-<title slug>` URL segment, or null. */
export function parseForumThreadNumber(segment: string): number | null {
  const match = /^([1-9]\d{0,14})(?:-|$)/.exec(segment);
  return match ? Number(match[1]) : null;
}

/** The page number from ?page=, or null when it isn't a whole number from 1. */
export function parseForumPage(value: string | string[] | undefined): number | null {
  if (value === undefined) return 1;
  return typeof value === 'string' && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null;
}

export function forumPageCount(itemCount: number, perPage: number): number {
  return Math.max(1, Math.ceil(itemCount / perPage));
}

/** "23 Oct 2026". Fixed locale and time zone so server and client render the same text. */
export function formatForumDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
