'use client';

import { useEffect, useState, useTransition } from 'react';
import { LuNewspaper } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { useForumViewer } from '@/components/forum/forum-viewer';
import {
  type ForumArticleResult,
  getForumArticleStatus,
  reviewForumArticle,
  setForumThreadFlag,
  submitForumArticle,
} from '@/app/actions/forum';
import type { ForumArticleSubmission } from '@/app/lib/forum';

interface ForumArticleStatusProps {
  threadId: string;
  authorId: string | null;
}

type NoteDecision = 'changes_requested' | 'declined';

const NOTE_DECISIONS: Record<NoteDecision, { title: string; confirmText: string; label: string }> = {
  changes_requested: { title: 'Request Changes', confirmText: 'Request changes', label: 'What should the author change?' },
  declined: { title: 'Decline Article', confirmText: 'Decline', label: 'Why is it declined? (optional)' },
};

/**
 * Under the title of a thread that isn't an article yet: its author suggests it
 * for publication, and moderators answer the suggestion.
 */
export function ForumArticleStatus({ threadId, authorId }: ForumArticleStatusProps) {
  const { userId, isModerator } = useForumViewer();
  const isAuthor = userId !== null && userId === authorId;
  // undefined while loading
  const [submission, setSubmission] = useState<ForumArticleSubmission | null | undefined>(undefined);
  const [saving, startSave] = useTransition();
  const [noteDecision, setNoteDecision] = useState<NoteDecision | null>(null);
  const [note, setNote] = useState('');

  // Only the author and moderators can see a suggestion, so only they load it
  const canSee = isAuthor || isModerator;
  useEffect(() => {
    if (!canSee) return;
    getForumArticleStatus(threadId)
      .then(setSubmission)
      .catch(() => toast.error('Failed to load the article suggestion'));
  }, [canSee, threadId]);

  // The action's cache invalidation sends the updated page back with its response
  const save = (action: () => Promise<ForumArticleResult>) =>
    new Promise<boolean>((resolve) =>
      startSave(async () => {
        try {
          const result = await action();
          if (!result.success) throw new Error(result.error);
          if (result.submission) setSubmission(result.submission);
          resolve(true);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to save');
          resolve(false);
        }
      }),
    );

  const submit = () => save(() => submitForumArticle(threadId));

  let content: React.ReactNode = null;
  if (submission === null && isAuthor) {
    content = (
      <>
        <span className="flex-1">Think this belongs on the articles page? Suggest it to the moderators.</span>
        <Button size="sm" disabled={saving} onClick={submit}>
          Submit for publication
        </Button>
      </>
    );
  } else if (submission?.status === 'submitted') {
    content = isModerator ? (
      <>
        <span className="flex-1">The author suggested this as an article.</span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={saving} onClick={() => save(() => setForumThreadFlag({ threadId, flag: 'is_article', value: true }))}>
            Publish
          </Button>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => setNoteDecision('changes_requested')}>
            Request changes
          </Button>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => setNoteDecision('declined')}>
            Decline
          </Button>
        </div>
      </>
    ) : (
      <span className="flex-1">Submitted for publication. A moderator will review it.</span>
    );
  } else if (submission?.status === 'changes_requested') {
    content = (
      <>
        <span className="flex-1 whitespace-pre-line">
          Changes were requested before publication{submission.review_note ? `: ${submission.review_note}` : '.'}
        </span>
        {isAuthor && (
          <Button size="sm" disabled={saving} onClick={submit}>
            Resubmit
          </Button>
        )}
      </>
    );
  } else if (submission?.status === 'declined') {
    content = (
      <span className="flex-1 whitespace-pre-line">
        Not published as an article{submission.review_note ? `: ${submission.review_note}` : '.'}
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
          onClose={() => {
            setNoteDecision(null);
            setNote('');
          }}
          onConfirm={() => save(() => reviewForumArticle({ threadId, status: noteDecision, note }))}
          confirmText={NOTE_DECISIONS[noteDecision].confirmText}
          confirmDisabled={noteDecision === 'changes_requested' && !note.trim()}
        />
      )}
    </>
  );
}
