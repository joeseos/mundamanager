'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { LuLock } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import type { RichTextEditorHandle } from '@/components/ui/rich-text-editor';
import { ForumPostForm } from '@/components/forum/forum-post-form';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { replyToForumThread } from '@/app/actions/forum';
import { signInPath } from '@/utils/auth';

/** Adds a quote to the reply, opening the reply box first. Null on a locked thread. */
const ForumQuoteContext = createContext<((html: string) => void) | null>(null);

export const useForumQuote = () => useContext(ForumQuoteContext);

interface ForumReplyBoxProps {
  threadId: string;
  /** Where signing in returns to. */
  path: string;
  locked: boolean;
  /** The thread's posts, which can quote into the reply box below them. */
  children: ReactNode;
}

export function ForumReplyBox({ threadId, path, locked, children }: ForumReplyBoxProps) {
  const { userId, loading } = useForumViewer();
  // The editor mounts only while replying: on mobile its toolbar is pinned to the top of the screen
  const [replying, setReplying] = useState(false);
  const [initialContent, setInitialContent] = useState('');
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const quote = useCallback((html: string) => {
    if (editorRef.current) {
      editorRef.current.appendContent(html);
    } else {
      // The editor hasn't loaded yet, so nothing has been typed: the quotes go in its starting text
      setInitialContent((content) => content + html);
      setReplying(true);
    }
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const closeReply = () => {
    setReplying(false);
    setInitialContent('');
  };

  return (
    <ForumQuoteContext.Provider value={locked ? null : quote}>
      {children}
      {locked ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
          <LuLock className="h-4 w-4" /> This thread is locked.
        </p>
      ) : (
        !loading && (
          <section ref={sectionRef} className="mt-4 border-t pt-4 scroll-mt-24">
            {!userId ? (
              <Button asChild variant="outline">
                <Link href={signInPath(path)}>Sign in to reply</Link>
              </Button>
            ) : replying ? (
              <ForumPostForm
                // Starts again with a quote that came in while the editor was loading
                key={initialContent}
                editorRef={editorRef}
                initialContent={initialContent}
                placeholder="Write a reply..."
                submitText="Post reply"
                onSubmit={({ content }) => replyToForumThread({ threadId, content })}
                onSuccess={closeReply}
                onCancel={closeReply}
              />
            ) : (
              <Button onClick={() => setReplying(true)}>Reply</Button>
            )}
          </section>
        )
      )}
    </ForumQuoteContext.Provider>
  );
}
