'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LuFolderInput, LuLock, LuLockOpen, LuPin, LuPinOff } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/modal';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { moveForumThread, setForumThreadFlag } from '@/app/actions/forum';

interface ForumThreadModerationProps {
  threadId: string;
  isPinned: boolean;
  isLocked: boolean;
  categoryId: string;
  /** The categories it can move to, in index order */
  categories: { id: string; name: string }[];
}

/** Pin, lock and move buttons for moderators, in the thread's header on every page. */
export function ForumThreadModeration({ threadId, isPinned, isLocked, categoryId, categories }: ForumThreadModerationProps) {
  const { isModerator } = useForumViewer();
  const router = useRouter();
  const [updating, startUpdate] = useTransition();
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const otherCategories = categories.filter((category) => category.id !== categoryId);

  if (!isModerator) return null;

  // The action's cache invalidation sends the updated page back with its response
  const toggle = (flag: 'is_pinned' | 'is_locked', value: boolean) =>
    startUpdate(async () => {
      try {
        const result = await setForumThreadFlag({ threadId, flag, value });
        if (!result.success) throw new Error(result.error);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update the thread');
      }
    });

  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="w-9 p-0"
        onClick={() => toggle('is_pinned', !isPinned)}
        disabled={updating}
        title={isPinned ? 'Unpin thread' : 'Pin thread'}
        aria-label={isPinned ? 'Unpin thread' : 'Pin thread'}
      >
        {isPinned ? <LuPinOff className="h-4 w-4" /> : <LuPin className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="w-9 p-0"
        onClick={() => toggle('is_locked', !isLocked)}
        disabled={updating}
        title={isLocked ? 'Unlock thread' : 'Lock thread'}
        aria-label={isLocked ? 'Unlock thread' : 'Lock thread'}
      >
        {isLocked ? <LuLockOpen className="h-4 w-4" /> : <LuLock className="h-4 w-4" />}
      </Button>
      {otherCategories.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-9 p-0"
          onClick={() => setMoveTo(otherCategories[0].id)}
          disabled={updating}
          title="Move thread"
          aria-label="Move thread"
        >
          <LuFolderInput className="h-4 w-4" />
        </Button>
      )}
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
    </div>
  );
}
