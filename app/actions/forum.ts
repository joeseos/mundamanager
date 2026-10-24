'use server';

import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { invalidateForumThread, invalidateForumThreadList } from '@/utils/cache-tags';
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp';
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

// The thread and its category, for the post's URL and the cache tags
const THREAD_SELECT = 'number, title, category_id, forum_categories(slug)';

interface ThreadRow {
  number: number;
  title: string;
  category_id: string;
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
 * 42501, so they and anything else get a generic message.
 */
function writeErrorMessage(error: PostgrestError, fallback: string): string {
  const fromTrigger =
    error.code === 'MM002' ||
    (error.code === '42501' && !error.message.includes('row-level security'));
  if (fromTrigger) return error.message;
  console.error(fallback, error);
  return error.code === '42501' ? "You can't post here" : fallback;
}

function postPath(thread: ThreadRow, postNumber: number): string {
  const page = Math.ceil(postNumber / FORUM_POSTS_PER_PAGE);
  const path = forumThreadPath(thread.forum_categories?.slug ?? '', thread.number, thread.title);
  return `${path}${page > 1 ? `?page=${page}` : ''}#post-${postNumber}`;
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
    await getAuthenticatedUser(supabase);

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

    invalidateForumThread(post.forum_threads.category_id, post.forum_threads.number);
    return { success: true, path: postPath(post.forum_threads, post.post_number) };
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
    if (!post) return { success: false, error: 'You can only edit your own posts' };

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
      if (error) throw error;
      if (!deleted.length) return { success: false, error: 'Only moderators can delete posts' };

      invalidateForumThreadList(thread.category_id, thread.number);
      return { success: true, path: forumCategoryPath(thread.forum_categories?.slug ?? '') };
    }

    // The trigger sets deleted_at itself, empties the content and keeps it as a revision
    const { data: removed, error } = await supabase
      .from('forum_posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', postId)
      .select('id');
    if (error && !error.message.includes('row-level security')) {
      return { success: false, error: writeErrorMessage(error, 'Failed to delete the post') };
    }
    if (error || !removed.length) return { success: false, error: 'Only moderators can delete posts' };

    invalidateForumThread(thread.category_id, thread.number);
    return { success: true, path: postPath(thread, post.post_number) };
  } catch (error) {
    console.error('Failed to delete the post', error);
    return { success: false, error: 'Failed to delete the post' };
  }
}
