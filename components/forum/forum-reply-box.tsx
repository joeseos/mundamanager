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
  // A new key after each reply empties the form and gives it a new image folder
  const [formKey, setFormKey] = useState(0);
  if (loading) return null;

  return (
    <section className="mt-4 border-t pt-4">
      <h2 className="text-lg font-semibold mb-2">Reply</h2>
      {userId ? (
        <ForumPostForm
          key={formKey}
          placeholder="Write a reply..."
          submitText="Post reply"
          onSubmit={({ content }) => replyToForumThread({ threadId, content })}
          onSuccess={() => setFormKey((key) => key + 1)}
        />
      ) : (
        <Button asChild variant="outline">
          <Link href={signInPath(path)}>Sign in to reply</Link>
        </Button>
      )}
    </section>
  );
}
