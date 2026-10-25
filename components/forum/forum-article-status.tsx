'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { LuNewspaper } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { getForumArticleStatus, reviewForumArticle, submitForumArticle } from '@/app/actions/forum';
import type { ForumArticleReview } from '@/app/lib/forum';

interface ForumArticleStatusProps {
  threadId: string;
  authorId: string | null;
  /** The article's page when it's published. */
  articlePath: string | null;
}

type NoteDecision = 'changes_requested' | 'declined';

const NOTE_DECISIONS: Record<NoteDecision, { title: string; confirmText: string; label: string }> = {
  changes_requested: { title: 'Request Changes', confirmText: 'Request changes', label: 'What should the author change?' },
  declined: { title: 'Decline Article', confirmText: 'Decline', label: 'Why is it declined? (optional)' },
};

/**
 * Under the thread's title: the author submits the opening post as an article,
 * and admins review it. Everyone sees the link once it's published.
 */
export function ForumArticleStatus({ threadId, authorId, articlePath }: ForumArticleStatusProps) {
  const { userId, isAdmin } = useForumViewer();
  const isAuthor = userId !== null && userId === authorId;
  const [review, setReview] = useState<ForumArticleReview | null | undefined>(undefined);
  const [saving, startSave] = useTransition();
  const [noteDecision, setNoteDecision] = useState<NoteDecision | null>(null);
  const [note, setNote] = useState('');

  // Only the author and admins can see a submission, so only they load it
  const canSeeReview = isAuthor || isAdmin;
  useEffect(() => {
    if (!canSeeReview || articlePath) return;
    getForumArticleStatus(threadId)
      .then(setReview)
      .catch(() => toast.error('Failed to load the article status'));
  }, [canSeeReview, articlePath, threadId]);

  const save = (action: () => ReturnType<typeof submitForumArticle>) =>
    new Promise<boolean>((resolve) =>
      startSave(async () => {
        const result = await action();
        if (!result.success) toast.error(result.error);
        else setReview(result.review);
        resolve(result.success);
      }),
    );

  const decide = (status: 'published' | NoteDecision, reviewNote?: string) =>
    save(() => reviewForumArticle({ threadId, status, note: reviewNote }));

  const openNote = (decision: NoteDecision) => {
    setNote('');
    setNoteDecision(decision);
  };

  let content: React.ReactNode = null;
  if (articlePath) {
    content = (
      <>
        <span className="flex-1">
          Published as an article.{' '}
          <Link href={articlePath} prefetch={false} className="underline hover:text-red-800">
            Read the article
          </Link>
        </span>
        {isAdmin && (
          <Button variant="outline" size="sm" disabled={saving} onClick={() => openNote('declined')}>
            Unpublish
          </Button>
        )}
      </>
    );
  } else if (review === null && isAuthor) {
    content = (
      <>
        <span className="flex-1">Want this on the articles page? An admin reviews it first.</span>
        <Button size="sm" disabled={saving} onClick={() => save(() => submitForumArticle(threadId))}>
          Submit for publication
        </Button>
      </>
    );
  } else if (review?.status === 'submitted') {
    content = isAdmin ? (
      <>
        <span className="flex-1">Submitted for publication.</span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={saving} onClick={() => decide('published')}>
            Approve
          </Button>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => openNote('changes_requested')}>
            Request changes
          </Button>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => openNote('declined')}>
            Decline
          </Button>
        </div>
      </>
    ) : (
      <span className="flex-1">Submitted for publication. An admin will review it.</span>
    );
  } else if (review?.status === 'changes_requested') {
    content = (
      <>
        <span className="flex-1 whitespace-pre-line">
          Changes were requested before publication{review.review_note ? `: ${review.review_note}` : '.'}
        </span>
        {isAuthor && (
          <Button size="sm" disabled={saving} onClick={() => save(() => submitForumArticle(threadId))}>
            Resubmit
          </Button>
        )}
      </>
    );
  } else if (review?.status === 'declined') {
    content = (
      <span className="flex-1 whitespace-pre-line">
        Not published as an article{review.review_note ? `: ${review.review_note}` : '.'}
      </span>
    );
  }

  if (!content) return null;

  return (
    <>
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
        <LuNewspaper className="h-4 w-4 shrink-0 hidden sm:block" />
        {content}
      </div>
      {noteDecision && (
        <Modal
          title={NOTE_DECISIONS[noteDecision].title}
          content={
            <div>
              <label htmlFor="forum-article-note" className="block text-sm font-medium text-muted-foreground mb-1">
                {NOTE_DECISIONS[noteDecision].label}
              </label>
              <Textarea id="forum-article-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={4} />
            </div>
          }
          onClose={() => setNoteDecision(null)}
          onConfirm={() => decide(noteDecision, note)}
          confirmText={NOTE_DECISIONS[noteDecision].confirmText}
          confirmDisabled={noteDecision === 'changes_requested' && !note.trim()}
        />
      )}
    </>
  );
}
