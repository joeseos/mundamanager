'use client';

import { useState } from 'react';
import { LuPencil } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { ForumPostForm } from '@/components/forum/forum-post-form';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { editForumPost } from '@/app/actions/forum';

interface ForumPostContentProps {
  post: { id: string; post_number: number; author_id: string | null; content: string };
  /** Edited along with the opening post. */
  threadTitle: string;
}

/** A post's text, with an Edit button for its author. */
export function ForumPostContent({ post, threadTitle }: ForumPostContentProps) {
  const { userId } = useForumViewer();
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
      <div className="prose max-w-none [&_li]:marker:text-red-800" dangerouslySetInnerHTML={{ __html: post.content }} />
      {userId !== null && userId === post.author_id && (
        <div className="flex justify-end mt-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <LuPencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        </div>
      )}
    </>
  );
}
