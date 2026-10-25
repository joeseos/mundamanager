import { slugifyHeading } from '@/utils/user-guide-content';

// The forum's URLs and display text, kept apart from its loaders so client components can use them

export function forumCategoryPath(categorySlug: string): string {
  return `/forum/${categorySlug}`;
}

/** /forum/<category slug>/<number>-<title slug>. Only the number identifies the thread. */
export function forumThreadPath(categorySlug: string, number: number, title: string): string {
  return `/forum/${categorySlug}/${number}-${slugifyHeading(title)}`;
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

/** /articles/<number>-<title slug>, numbered like the thread. */
export function forumArticlePath(number: number, title: string): string {
  return `/articles/${number}-${slugifyHeading(title)}`;
}
