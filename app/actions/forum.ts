'use server';

import { after } from 'next/server';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import {
  invalidateForumArticles,
  invalidateForumThread,
  invalidateForumThreadList,
  invalidateForumThreadPosts,
} from '@/utils/cache-tags';
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp';
import { sanitizeArticleHtml } from '@/utils/sanitize-notification-html';
import {
  FORUM_POSTS_PER_PAGE,
  type ForumArticleReview,
  forumArticlePath,
  forumCategoryPath,
  forumMentionIds,
  forumPageHref,
  forumThreadPath,
  getForumArticleReview,
  getForumCategories,
} from '@/app/lib/forum';

export interface ForumActionResult {
  success: boolean;
  error?: string;
  /** Where the client goes next: the new thread, or the post just made or edited. */
  path?: string;
}

// Same limits as the forum_threads and forum_posts check constraints
const TITLE_MAX_LENGTH = 150;
const CONTENT_MAX_LENGTH = 50000;

// The thread and its category, for the post's URL and the cache tags, and its author for reply notifications
const THREAD_SELECT = 'number, title, category_id, author_id, forum_categories(slug)';

interface ThreadRow {
  number: number;
  title: string;
  category_id: string;
  author_id: string | null;
  forum_categories: { slug: string } | null;
}

function validateTitle(title: string): string | null {
  if (!title) return 'Give the thread a title';
  if (title.length > TITLE_MAX_LENGTH) return `Titles can be at most ${TITLE_MAX_LENGTH} characters`;
  return null;
}

function validateContent(content: string): string | null {
  if (content.length > CONTENT_MAX_LENGTH) return 'This post is too long';
  // What the page will show, so a post of only stripped markup counts as empty
  if (isHtmlEffectivelyEmpty(sanitizeArticleHtml(content))) return 'Write something first';
  return null;
}

/**
 * The forum triggers raise their messages for the user with SQLSTATE MM002
 * (posting limits, a locked thread, a removed post). Anything else is logged:
 * RLS refusals (42501) get `refusal`, other errors the fallback.
 */
function writeErrorMessage(error: PostgrestError, fallback: string, refusal = "You can't post here"): string {
  if (error.code === 'MM002') return error.message;
  console.error(fallback, error);
  return error.code === '42501' ? refusal : fallback;
}

function postPath(thread: ThreadRow, postNumber: number): string {
  const path = forumThreadPath(thread.forum_categories?.slug ?? '', thread.number, thread.title);
  return `${forumPageHref(path, Math.ceil(postNumber / FORUM_POSTS_PER_PAGE))}#post-${postNumber}`;
}

// So one post can't notify a crowd
const MENTION_NOTIFY_LIMIT = 10;

/**
 * Notifies the people a new post mentions, and `replyTo` (the thread's author on
 * a reply) unless they're mentioned too. Edits notify no one, so editing a
 * mention out and back in can't notify someone again. Runs after the response,
 * as the post is saved by now, so a failure is only logged.
 */
async function notifyForumPost(
  supabase: SupabaseClient,
  params: { senderId: string; thread: ThreadRow; postNumber: number; content: string; replyTo?: string | null },
) {
  const { senderId, thread } = params;
  const mentioned = [...forumMentionIds(sanitizeArticleHtml(params.content))]
    .filter((id) => id !== senderId)
    .slice(0, MENTION_NOTIFY_LIMIT);
  const replyTo = params.replyTo && params.replyTo !== senderId && !mentioned.includes(params.replyTo) ? params.replyTo : null;
  if (!mentioned.length && !replyTo) return;

  // Also checks the mentioned ids are real users
  const { data: profiles, error } = await supabase.from('profiles').select('id, username').in('id', [senderId, ...mentioned]);
  if (error) {
    console.error('Failed to send the forum notifications', error);
    return;
  }

  const sender = profiles.find((profile) => profile.id === senderId)?.username ?? 'Someone';
  const notification = { sender_id: senderId, link: postPath(thread, params.postNumber) };
  const rows = profiles
    .filter((profile) => profile.id !== senderId)
    .map((profile) => ({
      ...notification,
      receiver_id: profile.id,
      type: 'forum_mention',
      text: `${sender} mentioned you in "${thread.title}".`,
    }));
  if (replyTo) {
    rows.push({ ...notification, receiver_id: replyTo, type: 'forum_reply', text: `${sender} replied to your thread "${thread.title}".` });
  }

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) console.error('Failed to send the forum notifications', insertError);
}

export async function createForumThread(params: {
  categoryId: string;
  title: string;
  content: string;
}): Promise<ForumActionResult> {
  const title = params.title.trim();
  const invalid = validateTitle(title) ?? validateContent(params.content);
  if (invalid) return { success: false, error: invalid };

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Starts the thread and its opening post in one transaction
    const { data: thread, error } = await supabase
      .rpc('create_forum_thread', {
        p_category_id: params.categoryId,
        p_title: title,
        p_content: params.content,
      })
      .select(THREAD_SELECT)
      .single<ThreadRow>();
    if (error) return { success: false, error: writeErrorMessage(error, 'Failed to start the thread') };

    after(() => notifyForumPost(supabase, { senderId: user.id, thread, postNumber: 1, content: params.content }));
    invalidateForumThreadList(thread.category_id, thread.number);
    return { success: true, path: postPath(thread, 1) };
  } catch (error) {
    console.error('Failed to start the thread', error);
    return { success: false, error: 'Failed to start the thread' };
  }
}

export async function replyToForumThread(params: {
  threadId: string;
  content: string;
}): Promise<ForumActionResult> {
  const invalid = validateContent(params.content);
  if (invalid) return { success: false, error: invalid };

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: post, error } = await supabase
      .from('forum_posts')
      .insert({ thread_id: params.threadId, author_id: user.id, content: params.content })
      .select(`post_number, forum_threads(${THREAD_SELECT})`)
      .single<{ post_number: number; forum_threads: ThreadRow }>();
    if (error) return { success: false, error: writeErrorMessage(error, 'Failed to post the reply') };

    const thread = post.forum_threads;
    after(() =>
      notifyForumPost(supabase, {
        senderId: user.id,
        thread,
        postNumber: post.post_number,
        content: params.content,
        replyTo: thread.author_id,
      }),
    );
    invalidateForumThread(thread.category_id, thread.number);
    return { success: true, path: postPath(thread, post.post_number) };
  } catch (error) {
    console.error('Failed to post the reply', error);
    return { success: false, error: 'Failed to post the reply' };
  }
}

/** Edits a post. On a thread's opening post, `title` renames the thread too. */
export async function editForumPost(params: {
  postId: string;
  content: string;
  title?: string;
}): Promise<ForumActionResult> {
  const title = params.title?.trim();
  const invalid = (title === undefined ? null : validateTitle(title)) ?? validateContent(params.content);
  if (invalid) return { success: false, error: invalid };

  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    // RLS limits this to the author's own posts (and moderators), so other posts match no row
    const { data: post, error } = await supabase
      .from('forum_posts')
      .update({ content: params.content })
      .eq('id', params.postId)
      .select(`post_number, thread_id, forum_threads(${THREAD_SELECT})`)
      .maybeSingle<{ post_number: number; thread_id: string; forum_threads: ThreadRow }>();
    if (error) return { success: false, error: writeErrorMessage(error, 'Failed to save the post') };
    if (!post) return { success: false, error: "You can't edit this post" };

    const thread = post.forum_threads;
    const renamed = title !== undefined && post.post_number === 1 && title !== thread.title;
    let titleError: PostgrestError | null = null;
    if (renamed) {
      ({ error: titleError } = await supabase.from('forum_threads').update({ title }).eq('id', post.thread_id));
      if (!titleError) thread.title = title;
    }

    // The content is saved even if the rename failed, so clear its cache either way.
    // Only a new title shows outside the thread, and the opening post on its article card.
    if (renamed && !titleError) invalidateForumThreadList(thread.category_id, thread.number);
    else invalidateForumThreadPosts(thread.number);
    if (post.post_number === 1) invalidateForumArticles();
    if (titleError) return { success: false, error: writeErrorMessage(titleError, 'Failed to rename the thread') };
    return { success: true, path: postPath(thread, post.post_number) };
  } catch (error) {
    console.error('Failed to save the post', error);
    return { success: false, error: 'Failed to save the post' };
  }
}

const MODERATORS_ONLY = 'Only moderators can delete posts';

/**
 * Removes a post (moderators only). Removing a thread's opening post deletes the
 * thread; any other post keeps its place as "This post was removed".
 */
export async function deleteForumPost(postId: string): Promise<ForumActionResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data: post, error: readError } = await supabase
      .from('forum_posts')
      .select(`post_number, thread_id, forum_threads(${THREAD_SELECT})`)
      .eq('id', postId)
      .single<{ post_number: number; thread_id: string; forum_threads: ThreadRow }>();
    if (readError) throw readError;
    const thread = post.forum_threads;

    // RLS limits both to moderators: the thread delete matches no row, the post update is refused
    if (post.post_number === 1) {
      const { data: deleted, error } = await supabase
        .from('forum_threads')
        .delete()
        .eq('id', post.thread_id)
        .select('id');
      if (error) return { success: false, error: writeErrorMessage(error, 'Failed to delete the thread', MODERATORS_ONLY) };
      if (!deleted.length) return { success: false, error: MODERATORS_ONLY };

      invalidateForumThreadList(thread.category_id, thread.number);
      return { success: true, path: forumCategoryPath(thread.forum_categories?.slug ?? '') };
    }

    // The trigger sets deleted_at itself, empties the content and keeps it as a revision
    const { data: removed, error } = await supabase
      .from('forum_posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', postId)
      .select('id');
    if (error) return { success: false, error: writeErrorMessage(error, 'Failed to delete the post', MODERATORS_ONLY) };
    if (!removed.length) return { success: false, error: MODERATORS_ONLY };

    // The thread list shows nothing of a reply but the count, which a removal keeps
    invalidateForumThreadPosts(thread.number);
    return { success: true, path: postPath(thread, post.post_number) };
  } catch (error) {
    console.error('Failed to delete the post', error);
    return { success: false, error: 'Failed to delete the post' };
  }
}

const MODERATORS_ONLY_FLAGS = 'Only moderators can pin or lock threads';
const MODERATORS_ONLY_MOVE = 'Only moderators can move threads';

/** Pins or locks a thread, or undoes it (moderators only). */
export async function setForumThreadFlag(params: {
  threadId: string;
  flag: 'is_pinned' | 'is_locked';
  value: boolean;
}): Promise<ForumActionResult> {
  // Server actions can be called with anything, so don't let the flag name another column
  if (params.flag !== 'is_pinned' && params.flag !== 'is_locked') return { success: false, error: 'Unknown setting' };

  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    // RLS lets only the author and moderators update a thread, and the trigger refuses the author
    const { data: thread, error } = await supabase
      .from('forum_threads')
      .update({ [params.flag]: params.value })
      .eq('id', params.threadId)
      .select(THREAD_SELECT)
      .maybeSingle<ThreadRow>();
    if (error) return { success: false, error: writeErrorMessage(error, 'Failed to update the thread', MODERATORS_ONLY_FLAGS) };
    if (!thread) return { success: false, error: MODERATORS_ONLY_FLAGS };

    invalidateForumThread(thread.category_id, thread.number);
    return { success: true };
  } catch (error) {
    console.error('Failed to update the thread', error);
    return { success: false, error: 'Failed to update the thread' };
  }
}

/** Moves a thread to another category (moderators only). */
export async function moveForumThread(params: { threadId: string; categoryId: string }): Promise<ForumActionResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data: from, error: readError } = await supabase
      .from('forum_threads')
      .select('category_id')
      .eq('id', params.threadId)
      .maybeSingle();
    if (readError) throw readError;
    if (!from) return { success: false, error: 'This thread no longer exists' };
    if (from.category_id === params.categoryId) return { success: false, error: 'The thread is already in that category' };

    // RLS lets only the author and moderators update a thread, and the trigger refuses the author
    const { data: thread, error } = await supabase
      .from('forum_threads')
      .update({ category_id: params.categoryId })
      .eq('id', params.threadId)
      .select(THREAD_SELECT)
      .maybeSingle<ThreadRow>();
    if (error) return { success: false, error: writeErrorMessage(error, 'Failed to move the thread', MODERATORS_ONLY_MOVE) };
    if (!thread) return { success: false, error: MODERATORS_ONLY_MOVE };

    // Both categories' lists and counts change
    invalidateForumThread(from.category_id, thread.number);
    invalidateForumThreadList(thread.category_id, thread.number);
    return { success: true, path: postPath(thread, 1) };
  } catch (error) {
    console.error('Failed to move the thread', error);
    return { success: false, error: 'Failed to move the thread' };
  }
}

/** The categories a moderator can move a thread to, loaded when the Move dialog opens. */
export async function getForumMoveCategories(): Promise<{ id: string; name: string }[]> {
  return (await getForumCategories()).map(({ id, name }) => ({ id, name }));
}

/** Likes a post, or takes the like back. RLS refuses likes on your own posts and removed ones. */
export async function setForumPostLike(params: { postId: string; liked: boolean }): Promise<ForumActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const like = { post_id: params.postId, user_id: user.id };
    // The post comes back with the like, for the cache tags
    const likes = supabase.from('forum_post_likes');
    const { data, error } = await (params.liked ? likes.upsert(like, { ignoreDuplicates: true }) : likes.delete().match(like))
      .select(`forum_posts(post_number, forum_threads(${THREAD_SELECT}))`)
      .maybeSingle<{ forum_posts: { post_number: number; forum_threads: ThreadRow } }>();
    if (error) throw error;
    // Liking twice, or taking back a like that's gone, changes nothing
    if (!data) return { success: true };

    // The category list shows the opening post's likes
    const { post_number, forum_threads: thread } = data.forum_posts;
    if (post_number === 1) invalidateForumThread(thread.category_id, thread.number);
    else invalidateForumThreadPosts(thread.number);
    return { success: true };
  } catch (error) {
    console.error('Failed to update the like', error);
    return { success: false, error: 'Failed to update the like' };
  }
}

export interface ForumArticleResult extends ForumActionResult {
  review?: ForumArticleReview;
}

/** Where the thread's submission stands, for its author and admins (RLS shows no one else). */
export async function getForumArticleStatus(threadId: string): Promise<ForumArticleReview | null> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  return getForumArticleReview(user.id, threadId);
}

const AUTHOR_ONLY = "Only the thread's author can submit it";

/** Submits a thread's opening post for publication as an article, or resubmits it after changes were asked for. */
export async function submitForumArticle(threadId: string): Promise<ForumArticleResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const articles = supabase.from('forum_articles');
    const { data: resubmitted, error: updateError } = await articles
      .update({ status: 'submitted' })
      .eq('thread_id', threadId)
      .eq('status', 'changes_requested')
      .select('thread_id');
    if (updateError) return { success: false, error: writeErrorMessage(updateError, 'Failed to submit the thread', AUTHOR_ONLY) };

    if (!resubmitted.length) {
      // RLS lets only the thread's author insert, and the trigger starts it as submitted
      const { error } = await articles.insert({ thread_id: threadId });
      if (error?.code === '23505') return { success: false, error: 'This thread was already submitted' };
      if (error) return { success: false, error: writeErrorMessage(error, 'Failed to submit the thread', AUTHOR_ONLY) };
    }
    return { success: true, review: { status: 'submitted', review_note: null } };
  } catch (error) {
    console.error('Failed to submit the thread', error);
    return { success: false, error: 'Failed to submit the thread' };
  }
}

type ForumArticleDecision = Exclude<ForumArticleReview['status'], 'submitted'>;

const REVIEW_NOTE_MAX_LENGTH = 2000;
const ADMINS_ONLY = 'Only admins can review articles';

const DECISION_TEXT: Record<ForumArticleDecision, (title: string) => string> = {
  published: (title) => `Your thread "${title}" was published as an article.`,
  changes_requested: (title) => `Changes were asked for before your thread "${title}" can be published.`,
  declined: (title) => `Your thread "${title}" was not published as an article.`,
};

/** Publishes a submitted thread as an article, asks its author for changes, or declines it (admins only). */
export async function reviewForumArticle(params: {
  threadId: string;
  status: ForumArticleDecision;
  note?: string;
}): Promise<ForumArticleResult> {
  // Server actions can be called with anything
  if (!Object.hasOwn(DECISION_TEXT, params.status)) return { success: false, error: 'Unknown decision' };
  const note = params.note?.trim() || null;
  if (note && note.length > REVIEW_NOTE_MAX_LENGTH) {
    return { success: false, error: `Notes can be at most ${REVIEW_NOTE_MAX_LENGTH} characters` };
  }

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // RLS lets only the author and admins update, and the trigger refuses the author
    const { data, error } = await supabase
      .from('forum_articles')
      .update({ status: params.status, review_note: note })
      .eq('thread_id', params.threadId)
      .select(`forum_threads(${THREAD_SELECT})`)
      .maybeSingle<{ forum_threads: ThreadRow }>();
    if (error) return { success: false, error: writeErrorMessage(error, 'Failed to save the review', ADMINS_ONLY) };
    if (!data) return { success: false, error: ADMINS_ONLY };

    const thread = data.forum_threads;
    if (thread.author_id && thread.author_id !== user.id) {
      const notification = {
        sender_id: user.id,
        receiver_id: thread.author_id,
        type: 'forum_article',
        text: DECISION_TEXT[params.status](thread.title),
        link: params.status === 'published' ? forumArticlePath(thread.number, thread.title) : postPath(thread, 1),
      };
      after(async () => {
        const { error: notifyError } = await supabase.from('notifications').insert(notification);
        if (notifyError) console.error('Failed to send the article review notification', notifyError);
      });
    }
    invalidateForumArticles();
    return { success: true, review: { status: params.status, review_note: note } };
  } catch (error) {
    console.error('Failed to save the review', error);
    return { success: false, error: 'Failed to save the review' };
  }
}

