'use server';

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { invalidateForumThread, invalidateForumThreadList } from '@/utils/cache-tags';
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp';
import { sanitizeArticleHtml } from '@/utils/sanitize-notification-html';
import { FORUM_POSTS_PER_PAGE, forumCategoryPath, forumThreadPath } from '@/app/lib/forum';

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
  if (isHtmlEffectivelyEmpty(content)) return 'Write something first';
  if (content.length > CONTENT_MAX_LENGTH) return 'This post is too long';
  return null;
}

/**
 * The forum triggers raise messages meant for the user: the posting limits
 * (MM002), and a locked thread or removed post (42501). RLS refusals share
 * 42501, so they get `refusal` and anything else the fallback.
 */
function writeErrorMessage(error: PostgrestError, fallback: string, refusal = "You can't post here"): string {
  const fromTrigger =
    error.code === 'MM002' ||
    (error.code === '42501' && !error.message.includes('row-level security'));
  if (fromTrigger) return error.message;
  console.error(fallback, error);
  return error.code === '42501' ? refusal : fallback;
}

function postPath(thread: ThreadRow, postNumber: number): string {
  const page = Math.ceil(postNumber / FORUM_POSTS_PER_PAGE);
  const path = forumThreadPath(thread.forum_categories?.slug ?? '', thread.number, thread.title);
  return `${path}${page > 1 ? `?page=${page}` : ''}#post-${postNumber}`;
}

// How the sanitizer writes an @mention, whose id it has checked is a uuid
const MENTION_ID = /data-type="mention" data-id="([^"]+)"/g;
// So one post can't notify a crowd
const MENTION_NOTIFY_LIMIT = 10;

/** The users a post mentions, read from what the page will show. */
function mentionedUserIds(html: string): Set<string> {
  return new Set(Array.from(sanitizeArticleHtml(html).matchAll(MENTION_ID), ([, id]) => id));
}

/**
 * Notifies the people a new post mentions, and `replyTo` (the thread's author on
 * a reply) unless they're mentioned too. Edits notify no one, so editing a
 * mention out and back in can't notify someone again. The post is saved by now,
 * so a failure is only logged.
 */
async function notifyForumPost(
  supabase: SupabaseClient,
  params: { senderId: string; thread: ThreadRow; postNumber: number; content: string; replyTo?: string | null },
) {
  const { senderId, thread } = params;
  const mentioned = [...mentionedUserIds(params.content)]
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

    await notifyForumPost(supabase, { senderId: user.id, thread, postNumber: 1, content: params.content });
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
    await notifyForumPost(supabase, {
      senderId: user.id,
      thread,
      postNumber: post.post_number,
      content: params.content,
      replyTo: thread.author_id,
    });
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

    // The content is saved even if the rename failed, so clear its cache either way
    if (renamed && !titleError) invalidateForumThreadList(thread.category_id, thread.number);
    else invalidateForumThread(thread.category_id, thread.number);
    if (titleError) return { success: false, error: writeErrorMessage(titleError, 'Failed to rename the thread') };
    return { success: true, path: postPath(thread, post.post_number) };
  } catch (error) {
    console.error('Failed to save the post', error);
    return { success: false, error: 'Failed to save the post' };
  }
}

/**
 * Removes a post (moderators only). Removing a thread's opening post deletes the
 * thread; any other post keeps its place as "This post was removed".
 */
const MODERATORS_ONLY = 'Only moderators can delete posts';

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

    invalidateForumThread(thread.category_id, thread.number);
    return { success: true, path: postPath(thread, post.post_number) };
  } catch (error) {
    console.error('Failed to delete the post', error);
    return { success: false, error: 'Failed to delete the post' };
  }
}

const MODERATORS_ONLY_FLAGS = 'Only moderators can pin or lock threads';

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
