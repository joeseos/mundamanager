'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LuLock, LuLockOpen, LuPencil, LuPin, LuPinOff, LuQuote, LuTrash2 } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { ForumPostForm } from '@/components/forum/forum-post-form';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { useForumQuote } from '@/components/forum/forum-reply-box';
import { deleteForumPost, editForumPost, setForumThreadFlag } from '@/app/actions/forum';
import type { ForumThread } from '@/app/lib/forum';

interface ForumPostContentProps {
  post: { id: string; post_number: number; author_id: string | null; author: string | null; content: string };
  /** Its title is edited along with the opening post, which also holds the pin and lock buttons. */
  thread: Pick<ForumThread, 'id' | 'title' | 'is_pinned' | 'is_locked'>;
  /** The page the post is on, which a quote links back to. */
  pagePath: string;
}

const QUOTE_ATTRIBUTION = 'Originally posted by ';

/**
 * A quote of the post for a reply: its text without the forum quotes it holds
 * itself, under a line naming its author and linking back to it.
 */
function quoteHtml(post: ForumPostContentProps['post'], pagePath: string): string {
  const quoted = new DOMParser().parseFromString(post.content, 'text/html').body;
  // Blockquotes the author made themselves stay
  quoted.querySelectorAll('blockquote').forEach((nested) => {
    if (nested.firstElementChild?.textContent?.startsWith(QUOTE_ATTRIBUTION)) nested.remove();
  });

  const blockquote = document.createElement('blockquote');
  const attribution = blockquote.appendChild(document.createElement('p'));
  attribution.append(QUOTE_ATTRIBUTION);
  const link = attribution.appendChild(document.createElement('strong')).appendChild(document.createElement('a'));
  link.href = `${pagePath}#post-${post.post_number}`;
  link.textContent = post.author ?? 'Unknown User';
  blockquote.append(...quoted.childNodes);
  // An empty paragraph after it, so the reply isn't typed into the quote
  return `${blockquote.outerHTML}<p></p>`;
}

/**
 * A post's text, with Quote for signed-in users, Edit for its author and moderators, and Delete for
 * moderators. Moderators can also pin and lock the thread from its opening post.
 */
export function ForumPostContent({ post, thread, pagePath }: ForumPostContentProps) {
  const router = useRouter();
  const { userId, isModerator } = useForumViewer();
  const quote = useForumQuote();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [updatingThread, startThreadUpdate] = useTransition();
  const isOpeningPost = post.post_number === 1;

  const toggleThreadFlag = (flag: 'is_pinned' | 'is_locked') =>
    startThreadUpdate(async () => {
      try {
        const result = await setForumThreadFlag({ threadId: thread.id, flag, value: !thread[flag] });
        if (!result.success) throw new Error(result.error);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update the thread');
      }
    });

  const handleDelete = async () => {
    try {
      const result = await deleteForumPost(post.id);
      if (!result.success) throw new Error(result.error);
      router.push(result.path!);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete the post');
      return false;
    }
  };

  if (editing) {
    return (
      <ForumPostForm
        initialTitle={isOpeningPost ? thread.title : undefined}
        initialContent={post.content}
        placeholder="Write your post..."
        submitText="Save"
        onSubmit={({ title, content }) =>
          editForumPost({ postId: post.id, content, title: isOpeningPost ? title : undefined })
        }
        onSuccess={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <div
        className="forum-post prose max-w-none [&_li]:marker:text-red-800"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
      {userId !== null && (
        <div className="flex justify-end gap-1 mt-2">
          {quote && (
            <Button variant="ghost" size="sm" onClick={() => quote(quoteHtml(post, pagePath))}>
              <LuQuote className="h-4 w-4 mr-1" /> Quote
            </Button>
          )}
          {(userId === post.author_id || isModerator) && (
            <Button
              variant="ghost"
              size="sm"
              className="w-9 p-0"
              onClick={() => setEditing(true)}
              title="Edit post"
              aria-label="Edit post"
            >
              <LuPencil className="h-4 w-4" />
            </Button>
          )}
          {isModerator && isOpeningPost && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="w-9 p-0"
                onClick={() => toggleThreadFlag('is_pinned')}
                disabled={updatingThread}
                title={thread.is_pinned ? 'Unpin thread' : 'Pin thread'}
                aria-label={thread.is_pinned ? 'Unpin thread' : 'Pin thread'}
              >
                {thread.is_pinned ? <LuPinOff className="h-4 w-4" /> : <LuPin className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-9 p-0"
                onClick={() => toggleThreadFlag('is_locked')}
                disabled={updatingThread}
                title={thread.is_locked ? 'Unlock thread' : 'Lock thread'}
                aria-label={thread.is_locked ? 'Unlock thread' : 'Lock thread'}
              >
                {thread.is_locked ? <LuLockOpen className="h-4 w-4" /> : <LuLock className="h-4 w-4" />}
              </Button>
            </>
          )}
          {isModerator && (
            <Button
              variant="ghost"
              size="sm"
              className="w-9 p-0 text-red-600 hover:text-red-700"
              onClick={() => setConfirmingDelete(true)}
              title="Delete post"
              aria-label="Delete post"
            >
              <LuTrash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
      {confirmingDelete && (
        <Modal
          title={isOpeningPost ? 'Delete Thread' : 'Delete Post'}
          content={
            <p>
              {isOpeningPost
                ? 'This is the opening post, so the whole thread and all its replies will be deleted. This cannot be undone.'
                : `Delete this post by ${post.author ?? 'Unknown User'}? It will show as removed.`}
            </p>
          }
          onClose={() => setConfirmingDelete(false)}
          onConfirm={handleDelete}
          confirmText="Delete"
        />
      )}
    </>
  );
}
