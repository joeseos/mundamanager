'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LuHeart, LuPencil, LuQuote, LuTrash2 } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { ForumPostForm } from '@/components/forum/forum-post-form';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { useForumQuote } from '@/components/forum/forum-reply-box';
import { deleteForumPost, editForumPost, setForumPostLike } from '@/app/actions/forum';

interface ForumPostContentProps {
  post: {
    id: string;
    post_number: number;
    author_id: string | null;
    author: string | null;
    content: string;
    like_count: number;
  };
  /** Whether the viewer has liked the post. */
  liked: boolean;
  /** Signed in, and not the post's author. */
  canLike: boolean;
  /** Edited along with the opening post. */
  threadTitle: string;
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
  // Plain profile links in the quote, so quoting doesn't notify the people the post mentions again
  quoted.querySelectorAll('a[data-type="mention"]').forEach((mention) => mention.removeAttribute('data-type'));

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

/** The post's likes, with a heart that likes it when the viewer can. */
function ForumLikeButton({ post, liked: savedLiked, canLike }: Pick<ForumPostContentProps, 'post' | 'liked' | 'canLike'>) {
  const [liked, setLiked] = useState(savedLiked);
  const [prevSavedLiked, setPrevSavedLiked] = useState(savedLiked);
  const [saving, setSaving] = useState(false);
  // A refreshed page may bring a like changed elsewhere, e.g. in another tab
  if (savedLiked !== prevSavedLiked) {
    setPrevSavedLiked(savedLiked);
    setLiked(savedLiked);
  }
  // like_count includes the saved like, so only a change since then is added
  const count = post.like_count - Number(savedLiked) + Number(liked);
  const heart = (
    <>
      <LuHeart className={`h-4 w-4 ${liked ? 'fill-current text-red-800' : ''}`} />
      {count > 0 && <span className="ml-1">{count}</span>}
    </>
  );

  if (!canLike) {
    return count > 0 ? (
      <span className="flex items-center h-9 px-3 text-sm text-muted-foreground" aria-label={`${count} likes`}>
        {heart}
      </span>
    ) : null;
  }

  const toggle = async () => {
    setSaving(true);
    setLiked(!liked);
    const result = await setForumPostLike({ postId: post.id, liked: !liked });
    if (!result.success) {
      setLiked(liked);
      toast.error(result.error);
    }
    setSaving(false);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={saving}
      aria-pressed={liked}
      title={liked ? 'Unlike' : 'Like'}
      aria-label={liked ? 'Unlike' : 'Like'}
    >
      {heart}
    </Button>
  );
}

/** A post's text, with Quote for signed-in users, Edit for its author and moderators, and Delete for moderators. */
export function ForumPostContent({ post, liked, canLike, threadTitle, pagePath }: ForumPostContentProps) {
  const router = useRouter();
  const { userId, isModerator } = useForumViewer();
  const quote = useForumQuote();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isOpeningPost = post.post_number === 1;

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
        initialTitle={isOpeningPost ? threadTitle : undefined}
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
      <div className="flex justify-end gap-1 mt-2 empty:hidden">
        <ForumLikeButton post={post} liked={liked} canLike={canLike} />
        {userId !== null && quote && (
          <Button variant="ghost" size="sm" onClick={() => quote(quoteHtml(post, pagePath))}>
            <LuQuote className="h-4 w-4 mr-1" /> Quote
          </Button>
        )}
        {userId !== null && (userId === post.author_id || isModerator) && (
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
