'use client';

import { useState } from 'react';
import { LuPencil, LuQuote } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { ForumPostForm } from '@/components/forum/forum-post-form';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { useForumQuote } from '@/components/forum/forum-reply-box';
import { editForumPost } from '@/app/actions/forum';

interface ForumPostContentProps {
  post: { id: string; post_number: number; author_id: string | null; author: string | null; content: string };
  /** Edited along with the opening post. */
  threadTitle: string;
  /** The page the post is on, which a quote links back to. */
  pagePath: string;
}

/**
 * A quote of the post for a reply: its text without the quotes it holds itself,
 * under a line naming its author and linking back to it.
 */
function quoteHtml(post: ForumPostContentProps['post'], pagePath: string): string {
  const quoted = new DOMParser().parseFromString(post.content, 'text/html').body;
  quoted.querySelectorAll('blockquote').forEach((nested) => nested.remove());

  const blockquote = document.createElement('blockquote');
  const attribution = blockquote.appendChild(document.createElement('p'));
  attribution.append('Originally posted by ');
  const link = attribution.appendChild(document.createElement('strong')).appendChild(document.createElement('a'));
  link.href = `${pagePath}#post-${post.post_number}`;
  link.textContent = post.author ?? 'Unknown User';
  blockquote.append(...quoted.childNodes);
  // An empty paragraph after it, so the reply isn't typed into the quote
  return `${blockquote.outerHTML}<p></p>`;
}

/** A post's text, with Quote for signed-in users and Edit for its author. */
export function ForumPostContent({ post, threadTitle, pagePath }: ForumPostContentProps) {
  const { userId } = useForumViewer();
  const quote = useForumQuote();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ForumPostForm
        initialTitle={post.post_number === 1 ? threadTitle : undefined}
        initialContent={post.content}
        placeholder="Write your post..."
        submitText="Save"
        onSubmit={({ title, content }) =>
          editForumPost({ postId: post.id, content, title: post.post_number === 1 ? title : undefined })
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
          {userId === post.author_id && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <LuPencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
        </div>
      )}
    </>
  );
}
