'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  LuEllipsis,
  LuFolderInput,
  LuLock,
  LuLockOpen,
  LuMessageSquareWarning,
  LuNewspaper,
  LuPin,
  LuPinOff,
  LuSend,
  LuTags,
  LuX,
} from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Modal from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { ForumTagPicker } from '@/components/forum/forum-tag-picker';
import { useForumViewer } from '@/components/forum/forum-viewer';
import {
  type ForumActionResult,
  getForumMoveCategories,
  getForumTagOptions,
  moveForumThread,
  reviewForumArticle,
  setForumThreadFlag,
  setForumThreadTags,
  submitForumArticle,
} from '@/app/actions/forum';
import type { ForumArticleSubmission, ForumTag } from '@/app/lib/forum';

interface ForumThreadMenuProps {
  threadId: string;
  isPinned: boolean;
  isLocked: boolean;
  isArticle: boolean;
  categoryId: string;
  isAuthor: boolean;
  /** The author's suggestion of the thread as an article, null when there is none or the viewer can't see it. */
  submissionStatus: ForumArticleSubmission['status'] | null;
  tagIds: string[];
}

type NoteDecision = 'changes_requested' | 'declined';

const NOTE_DECISIONS: Record<NoteDecision, { title: string; confirmText: string; label: string }> = {
  changes_requested: { title: 'Request Changes', confirmText: 'Request changes', label: 'What should the author change?' },
  declined: { title: 'Decline Article', confirmText: 'Decline', label: 'Why is it declined? (optional)' },
};

/**
 * The thread's ... menu, in its header on every page: moderators pin, lock, move
 * and publish the thread and answer its suggestion, its author suggests it as an
 * article, and both edit its tags.
 */
export function ForumThreadMenu({
  threadId,
  isPinned,
  isLocked,
  isArticle,
  categoryId,
  isAuthor,
  submissionStatus,
  tagIds,
}: ForumThreadMenuProps) {
  const { isModerator, loading } = useForumViewer();
  const router = useRouter();
  const [updating, startUpdate] = useTransition();
  const [moveTo, setMoveTo] = useState<string | null>(null);
  // Loaded the first time a moderator opens the Move dialog, so the page doesn't send them to every viewer
  const [otherCategories, setOtherCategories] = useState<{ id: string; name: string }[]>([]);
  const [noteDecision, setNoteDecision] = useState<NoteDecision | null>(null);
  const [note, setNote] = useState('');
  // Loaded the first time the Edit tags dialog opens, like the categories
  const [allTags, setAllTags] = useState<ForumTag[] | null>(null);
  const [editedTagIds, setEditedTagIds] = useState<string[] | null>(null);

  // Moderators publish directly, so only other authors suggest
  // Wait for the role, so a moderator's own thread never offers it
  const canSubmit = !loading && isAuthor && !isModerator && !isArticle && (submissionStatus === null || submissionStatus === 'changes_requested');
  // A locked thread's tags are the moderators', like its title
  const canEditTags = isModerator || (isAuthor && !isLocked);
  if (!isModerator && !canSubmit && !canEditTags) return null;

  // Resolves false on a failure, so the note dialog stays open. Suggestions aren't
  // cached, so their actions refresh the page; the flag actions' cache invalidation already does.
  const run = (action: () => Promise<ForumActionResult>, fallback: string, refresh = true) =>
    new Promise<boolean>((resolve) =>
      startUpdate(async () => {
        try {
          const result = await action();
          if (!result.success) throw new Error(result.error);
          if (refresh) router.refresh();
          resolve(true);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : fallback);
          resolve(false);
        }
      }),
    );

  const toggle = (flag: 'is_pinned' | 'is_locked' | 'is_article', value: boolean) =>
    run(() => setForumThreadFlag({ threadId, flag, value }), 'Failed to update the thread', false);

  const openMove = () =>
    startUpdate(async () => {
      try {
        const categories = otherCategories.length
          ? otherCategories
          : (await getForumMoveCategories()).filter((category) => category.id !== categoryId);
        if (!categories.length) {
          toast.error('There is no other category to move it to');
          return;
        }
        setOtherCategories(categories);
        setMoveTo(categories[0].id);
      } catch {
        toast.error('Failed to load the categories');
      }
    });

  const openTags = () =>
    startUpdate(async () => {
      try {
        if (!allTags) setAllTags(await getForumTagOptions());
        setEditedTagIds(tagIds);
      } catch {
        toast.error('Failed to load the tags');
      }
    });

  const closeNote = () => {
    setNoteDecision(null);
    setNote('');
  };

  return (
    <div className="shrink-0">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="w-9 p-0" disabled={updating} title="Thread options" aria-label="Thread options">
            <LuEllipsis className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canSubmit && (
            <DropdownMenuItem onClick={() => run(() => submitForumArticle(threadId), 'Failed to submit the thread')}>
              <LuSend className="mr-2 h-4 w-4" />
              {submissionStatus === 'changes_requested' ? 'Resubmit for publication' : 'Submit for publication'}
            </DropdownMenuItem>
          )}
          {canEditTags && (
            <DropdownMenuItem onClick={openTags}>
              <LuTags className="mr-2 h-4 w-4" />
              Edit tags
            </DropdownMenuItem>
          )}
          {isModerator && (
            <>
              <DropdownMenuItem onClick={() => toggle('is_pinned', !isPinned)}>
                {isPinned ? <LuPinOff className="mr-2 h-4 w-4" /> : <LuPin className="mr-2 h-4 w-4" />}
                {isPinned ? 'Unpin thread' : 'Pin thread'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggle('is_locked', !isLocked)}>
                {isLocked ? <LuLockOpen className="mr-2 h-4 w-4" /> : <LuLock className="mr-2 h-4 w-4" />}
                {isLocked ? 'Unlock thread' : 'Lock thread'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggle('is_article', !isArticle)}>
                <LuNewspaper className="mr-2 h-4 w-4" />
                {isArticle ? 'Remove from articles' : 'Publish as article'}
              </DropdownMenuItem>
              {submissionStatus === 'submitted' && (
                <>
                  <DropdownMenuItem onClick={() => setNoteDecision('changes_requested')}>
                    <LuMessageSquareWarning className="mr-2 h-4 w-4" />
                    Request changes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setNoteDecision('declined')}>
                    <LuX className="mr-2 h-4 w-4" />
                    Decline article
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={openMove}>
                <LuFolderInput className="mr-2 h-4 w-4" />
                Move thread
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {moveTo !== null && (
        <Modal
          title="Move Thread"
          content={
            <div>
              <label htmlFor="forum-move-category" className="block text-sm font-medium text-muted-foreground mb-1">
                Move thread to
              </label>
              <select
                id="forum-move-category"
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                {otherCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          }
          onClose={() => setMoveTo(null)}
          onConfirm={async () => {
            const result = await moveForumThread({ threadId, categoryId: moveTo });
            if (!result.success) {
              toast.error(result.error);
              return false;
            }
            router.push(result.path!);
            return true;
          }}
          confirmText="Move"
        />
      )}
      {allTags && editedTagIds && (
        <Modal
          title="Edit Tags"
          content={<ForumTagPicker tags={allTags} selected={editedTagIds} onChange={setEditedTagIds} />}
          onClose={() => setEditedTagIds(null)}
          onConfirm={() => run(() => setForumThreadTags({ threadId, tagIds: editedTagIds }), 'Failed to update the tags', false)}
          confirmText="Save"
        />
      )}
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
          onClose={closeNote}
          onConfirm={() => run(() => reviewForumArticle({ threadId, status: noteDecision, note }), 'Failed to answer the suggestion')}
          confirmText={NOTE_DECISIONS[noteDecision].confirmText}
          confirmDisabled={noteDecision === 'changes_requested' && !note.trim()}
        />
      )}
    </div>
  );
}
