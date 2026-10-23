'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ForumPostForm } from '@/components/forum/forum-post-form';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { replyToForumThread } from '@/app/actions/forum';
import { signInPath } from '@/utils/auth';

interface ForumReplyBoxProps {
  threadId: string;
  /** Where signing in returns to. */
  path: string;
}

export function ForumReplyBox({ threadId, path }: ForumReplyBoxProps) {
  const { userId, loading } = useForumViewer();
  // The editor mounts only while replying: on mobile its toolbar is pinned to the top of the screen
  const [replying, setReplying] = useState(false);
  if (loading) return null;

  return (
    <section className="mt-4 border-t pt-4">
      {!userId ? (
        <Button asChild variant="outline">
          <Link href={signInPath(path)}>Sign in to reply</Link>
        </Button>
      ) : replying ? (
        <ForumPostForm
          placeholder="Write a reply..."
          submitText="Post reply"
          onSubmit={({ content }) => replyToForumThread({ threadId, content })}
          onSuccess={() => setReplying(false)}
          onCancel={() => setReplying(false)}
        />
      ) : (
        <Button onClick={() => setReplying(true)}>Reply</Button>
      )}
    </section>
  );
}
