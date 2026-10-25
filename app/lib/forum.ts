import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { and, asc, between, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { getAppDb, withUserClaims } from '@/utils/db/client';
import {
  forumArticleSubmissions,
  forumCategories,
  forumPostLikes,
  forumPosts,
  forumTags,
  forumThreads,
  forumThreadTags,
  profiles,
} from '@/utils/db/schema';
import { TAGS } from '@/utils/cache-tags';
import { sanitizeArticleHtml } from '@/utils/sanitize-notification-html';
import { escapeHtml } from '@/utils/html';
import { decodeHtmlEntities } from '@/utils/htmlCleanUp';
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

export interface ForumTag {
  id: string;
  name: string;
}

export interface ForumThreadSummary {
  number: number;
  title: string;
  tags: ForumTag[];
  author: string | null;
  is_pinned: boolean;
  is_locked: boolean;
  post_count: number;
  /** The opening post's likes, which count as the thread's. */
  like_count: number;
  created_at: string;
  last_post_at: string;
  last_post_author: string | null;
}

export interface ForumThread extends Omit<ForumThreadSummary, 'like_count'> {
  id: string;
  author_id: string | null;
  /** Set when a moderator published the thread as an article. */
  article_published_at: string | null;
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
const openingPost = alias(forumPosts, 'opening_post');

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

/** The thread's tags in name order, as a JSON array, so a list stays one query. */
const threadTags = sql<ForumTag[]>`coalesce((
  select json_agg(json_build_object('id', ${forumTags.id}, 'name', ${forumTags.name}) order by ${forumTags.name})
  from ${forumThreadTags} join ${forumTags} on ${forumTags.id} = ${forumThreadTags.tag_id}
  where ${forumThreadTags.thread_id} = ${forumThreads.id}
), '[]'::json)`;

const THREAD_SUMMARY_COLUMNS = {
  number: forumThreads.number,
  title: forumThreads.title,
  tags: threadTags,
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
        .select({ ...THREAD_SUMMARY_COLUMNS, like_count: sql<number>`coalesce(${openingPost.like_count}, 0)` })
        .from(forumThreads)
        .leftJoin(author, eq(author.id, forumThreads.author_id))
        .leftJoin(lastPostAuthor, eq(lastPostAuthor.id, forumThreads.last_post_author_id))
        .leftJoin(openingPost, and(eq(openingPost.thread_id, forumThreads.id), eq(openingPost.post_number, 1)))
        .where(eq(forumThreads.category_id, categoryId))
        .orderBy(desc(forumThreads.is_pinned), desc(forumThreads.last_post_at))
        .limit(FORUM_THREADS_PER_PAGE)
        .offset((page - 1) * FORUM_THREADS_PER_PAGE),
    ['forum-threads-v2', categoryId, String(page)],
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
          author_id: forumThreads.author_id,
          article_published_at: sql<string | null>`to_json(${forumThreads.article_published_at})`,
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
    ['forum-thread-v2', String(number)],
    { tags: [TAGS.forumThread(number)], revalidate: false }
  )()
);

/**
 * One page of a thread's posts, oldest first. Post numbers run 1, 2, 3... with
 * no gaps (posts are removed, never deleted), so a page is a range of them.
 * Refreshes every 60 s so changes to the authors' profiles (name, avatar, role) show.
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

      const posts = rows.map(({ deleted_at, content, ...post }) => ({
        ...post,
        content: deleted_at ? '' : sanitizeArticleHtml(content),
        is_removed: deleted_at !== null,
      }));

      // A mention shows the user's current name, whatever text the post saved with it
      const mentioned = [...new Set(posts.flatMap((post) => [...forumMentionIds(post.content)]))];
      if (!mentioned.length) return posts;
      const names = new Map(
        (await getAppDb().select({ id: profiles.id, username: profiles.username }).from(profiles).where(inArray(profiles.id, mentioned)))
          .map(({ id, username }) => [id, username]),
      );
      return posts.map((post) => ({
        ...post,
        content: post.content.replace(MENTION, (_, tag: string) => {
          const name = escapeHtml(names.get(mentionId(tag) ?? '') ?? 'Unknown User');
          // data-label too, which the editor shows when the post is edited
          return `${tag.replace(/data-label="[^"]*"/, `data-label="${name}"`)}@${name}</a>`;
        }),
      }));
    },
    ['forum-posts', String(thread.number), String(page)],
    { tags: [TAGS.forumThread(thread.number)], revalidate: 60 }
  )();
}

/** Which of these posts the user has liked. Per viewer, so not cached; RLS shows a user only their own likes. */
export async function getForumLikedPostIds(userId: string, postIds: string[]): Promise<string[]> {
  if (!postIds.length) return [];
  const rows = await withUserClaims(userId, (tx) =>
    tx
      .select({ post_id: forumPostLikes.post_id })
      .from(forumPostLikes)
      .where(and(eq(forumPostLikes.user_id, userId), inArray(forumPostLikes.post_id, postIds)))
  );
  return rows.map((row) => row.post_id);
}

export function forumCategoryPath(categorySlug: string): string {
  return `/forum/${categorySlug}`;
}

/** /forum/<category slug>/<number>-<title slug>. Only the number identifies the thread. */
export function forumThreadPath(categorySlug: string, number: number, title: string): string {
  return `/forum/${categorySlug}/${number}-${slugifyHeading(title)}`;
}

// The sanitizer keeps data-type="mention" only on mentions, with a lowercase uuid it has checked as data-id
const MENTION = /(<a [^>]*data-type="mention"[^>]*>)[\s\S]*?<\/a>/g;
const mentionId = (tag: string) => /data-id="([^"]+)"/.exec(tag)?.[1];

/** The users sanitized post HTML mentions. */
export function forumMentionIds(html: string): Set<string> {
  return new Set(Array.from(html.matchAll(MENTION), ([, tag]) => mentionId(tag)).filter((id) => id !== undefined));
}

/**
 * A page of a thread or category: page 1 is the bare path, the others add /page/<n>.
 * In the path rather than ?page=, so every page can be a static page.
 */
export function forumPageHref(path: string, page: number): string {
  return page === 1 ? path : `${path}/page/${page}`;
}

/** The thread number from a `<number>-<title slug>` URL segment, or null. */
export function parseForumThreadNumber(segment: string): number | null {
  const match = /^([1-9]\d{0,14})(?:-|$)/.exec(segment);
  return match ? Number(match[1]) : null;
}

/** The page number from /page/<n>, or null when it isn't a whole number from 2 (page 1 is the bare path). */
export function parseForumPage(value: string | undefined): number | null {
  if (value === undefined) return 1;
  return /^[1-9]\d{0,5}$/.test(value) && value !== '1' ? Number(value) : null;
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

/** Replies in a thread, from its post_count, which includes the opening post. */
export function forumReplyCount(postCount: number): number {
  return Math.max(postCount - 1, 0);
}

/** "3 replies" for a thread's post_count. */
export function formatForumReplies(postCount: number): string {
  const replies = forumReplyCount(postCount);
  return `${replies} ${replies === 1 ? 'reply' : 'replies'}`;
}

export interface ForumArticle {
  number: number;
  title: string;
  category: { slug: string; name: string };
  tags: ForumTag[];
  author: string | null;
  author_avatar_url: string | null;
  post_count: number;
  published_at: string;
  /** The opening post's first image, shown on the article's card. */
  image: string | null;
  /** The start of the opening post's text. */
  excerpt: string;
}

const EXCERPT_LENGTH = 160;
const FIRST_IMAGE = /<img [^>]*src="([^"]+)"/;

/**
 * Published articles, newest first: threads a moderator published, shown by their
 * opening post. Refreshes every 60 s so changes to the authors' profiles show.
 */
export const getForumArticles = unstable_cache(
  async (): Promise<ForumArticle[]> => {
    const rows = await getAppDb()
      .select({
        number: forumThreads.number,
        title: forumThreads.title,
        category: { slug: forumCategories.slug, name: forumCategories.name },
        tags: threadTags,
        author: author.username,
        author_avatar_url: author.avatar_url,
        post_count: forumThreads.post_count,
        published_at: iso(forumThreads.article_published_at),
        content: openingPost.content,
      })
      .from(forumThreads)
      .innerJoin(forumCategories, eq(forumCategories.id, forumThreads.category_id))
      .innerJoin(openingPost, and(eq(openingPost.thread_id, forumThreads.id), eq(openingPost.post_number, 1)))
      .leftJoin(author, eq(author.id, forumThreads.author_id))
      .where(isNotNull(forumThreads.article_published_at))
      .orderBy(desc(forumThreads.article_published_at), desc(forumThreads.number));

    // From the sanitized HTML, so a card only shows an image the post itself could
    return rows.map(({ content, ...article }) => {
      const html = sanitizeArticleHtml(content);
      const image = FIRST_IMAGE.exec(html)?.[1];
      const text = decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
      return {
        ...article,
        image: image ? decodeHtmlEntities(image) : null,
        excerpt: text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text,
      };
    });
  },
  ['forum-articles-v2'],
  { tags: [TAGS.forumArticles()], revalidate: 60 }
);

// cache(): the page, its metadata and its breadcrumb share one lookup per request
export const getForumArticle = cache(async (number: number): Promise<ForumArticle | null> => {
  const articles = await getForumArticles();
  return articles.find((article) => article.number === number) ?? null;
});

/** Every tag, by name, for the tag picker. Tags are edited in the database, so the list refreshes every 60 s. */
export const getForumTags = unstable_cache(
  async (): Promise<ForumTag[]> =>
    getAppDb().select({ id: forumTags.id, name: forumTags.name }).from(forumTags).orderBy(asc(forumTags.name)),
  ['forum-tags'],
  { revalidate: 60 }
);

export type ForumArticleSubmission = Pick<typeof forumArticleSubmissions.$inferSelect, 'status' | 'review_note'>;

/** Where the author's suggestion of the thread stands. RLS shows it only to the author and moderators. */
export async function getForumArticleSubmission(userId: string, threadId: string): Promise<ForumArticleSubmission | null> {
  const [submission] = await withUserClaims(userId, (tx) =>
    tx
      .select({ status: forumArticleSubmissions.status, review_note: forumArticleSubmissions.review_note })
      .from(forumArticleSubmissions)
      .where(eq(forumArticleSubmissions.thread_id, threadId))
  );
  return submission ?? null;
}

export interface ForumArticleQueueItem {
  number: number;
  title: string;
  category_slug: string;
  author: string | null;
  submitted_at: string;
}

/** Suggestions waiting for a moderator, oldest first. Moderators only and rarely read, so not cached. */
export function getForumArticleQueue(userId: string): Promise<ForumArticleQueueItem[]> {
  return withUserClaims(userId, (tx) =>
    tx
      .select({
        number: forumThreads.number,
        title: forumThreads.title,
        category_slug: forumCategories.slug,
        author: author.username,
        submitted_at: iso(forumArticleSubmissions.submitted_at),
      })
      .from(forumArticleSubmissions)
      .innerJoin(forumThreads, eq(forumThreads.id, forumArticleSubmissions.thread_id))
      .innerJoin(forumCategories, eq(forumCategories.id, forumThreads.category_id))
      .leftJoin(author, eq(author.id, forumThreads.author_id))
      .where(eq(forumArticleSubmissions.status, 'submitted'))
      .orderBy(asc(forumArticleSubmissions.submitted_at))
  );
}

/** /articles/<number>-<title slug>, numbered like the thread. */
export function forumArticlePath(number: number, title: string): string {
  return `/articles/${number}-${slugifyHeading(title)}`;
}
