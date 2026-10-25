'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LuEllipsis, LuFolderInput, LuLock, LuLockOpen, LuPin, LuPinOff } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Modal from '@/components/ui/modal';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { getForumMoveCategories, moveForumThread, setForumThreadFlag } from '@/app/actions/forum';

interface ForumThreadModerationProps {
  threadId: string;
  isPinned: boolean;
  isLocked: boolean;
  categoryId: string;
}

/** A menu for moderators to pin, lock and move the thread, in the thread's header on every page. */
export function ForumThreadModeration({ threadId, isPinned, isLocked, categoryId }: ForumThreadModerationProps) {
  const { isModerator } = useForumViewer();
  const router = useRouter();
  const [updating, startUpdate] = useTransition();
  const [moveTo, setMoveTo] = useState<string | null>(null);
  // Loaded the first time a moderator opens the Move dialog, so the page doesn't send them to every viewer
  const [otherCategories, setOtherCategories] = useState<{ id: string; name: string }[]>([]);

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

  return (
    <div className="shrink-0">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-9 p-0"
            disabled={updating}
            title="Moderate thread"
            aria-label="Moderate thread"
          >
            <LuEllipsis className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => toggle('is_pinned', !isPinned)}>
            {isPinned ? <LuPinOff className="mr-2 h-4 w-4" /> : <LuPin className="mr-2 h-4 w-4" />}
            {isPinned ? 'Unpin thread' : 'Pin thread'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggle('is_locked', !isLocked)}>
            {isLocked ? <LuLockOpen className="mr-2 h-4 w-4" /> : <LuLock className="mr-2 h-4 w-4" />}
            {isLocked ? 'Unlock thread' : 'Lock thread'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openMove}>
            <LuFolderInput className="mr-2 h-4 w-4" />
            Move thread
          </DropdownMenuItem>
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
    </div>
  );
}
