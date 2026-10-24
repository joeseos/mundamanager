'use client';

import { useTransition } from 'react';
import { LuLock, LuLockOpen, LuPin, LuPinOff } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { setForumThreadFlag } from '@/app/actions/forum';

interface ForumThreadModerationProps {
  threadId: string;
  isPinned: boolean;
  isLocked: boolean;
}

/** Pin and lock buttons for moderators, in the thread's header on every page. */
export function ForumThreadModeration({ threadId, isPinned, isLocked }: ForumThreadModerationProps) {
  const { isModerator } = useForumViewer();
  const [updating, startUpdate] = useTransition();

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
    </div>
  );
}
