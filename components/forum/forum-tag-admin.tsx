'use client';

import { useState } from 'react';
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/modal';
import { useForumViewer } from '@/components/forum/forum-viewer';
import { type ForumActionResult, createForumTag, deleteForumTag, renameForumTag } from '@/app/actions/forum';
import type { ForumTagWithCount } from '@/app/lib/forum';

// Resolves false on a failure, so the dialog stays open. The cache invalidation refreshes the page.
async function run(action: Promise<ForumActionResult>): Promise<boolean> {
  const result = await action;
  if (!result.success) toast.error(result.error);
  return result.success;
}

function TagNameModal(props: { title: string; initialName: string; confirmText: string; onSave: (name: string) => Promise<ForumActionResult>; onClose: () => void }) {
  const [name, setName] = useState(props.initialName);
  return (
    <Modal
      title={props.title}
      content={
        <div>
          <label htmlFor="forum-tag-name" className="block text-sm font-medium text-muted-foreground mb-1">
            Name
          </label>
          <Input id="forum-tag-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
        </div>
      }
      onClose={props.onClose}
      onConfirm={() => run(props.onSave(name))}
      confirmText={props.confirmText}
      confirmDisabled={!name.trim() || name.trim() === props.initialName}
    />
  );
}

/** The tag list's Add tag button, for moderators. */
export function ForumAddTagButton() {
  const { isModerator } = useForumViewer();
  const [adding, setAdding] = useState(false);
  if (!isModerator) return null;

  return (
    <>
      <Button size="sm" onClick={() => setAdding(true)}>
        <LuPlus className="h-4 w-4 mr-1" /> Add tag
      </Button>
      {adding && <TagNameModal title="Add Tag" initialName="" confirmText="Add" onSave={createForumTag} onClose={() => setAdding(false)} />}
    </>
  );
}

/** A tag's Rename and Delete buttons, for moderators. */
export function ForumTagActions({ tag }: { tag: ForumTagWithCount }) {
  const { isModerator } = useForumViewer();
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  if (!isModerator) return null;

  return (
    <div className="relative z-10 flex shrink-0">
      <Button variant="ghost" size="sm" className="w-9 p-0" title="Rename tag" aria-label="Rename tag" onClick={() => setDialog('rename')}>
        <LuPencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" className="w-9 p-0" title="Delete tag" aria-label="Delete tag" onClick={() => setDialog('delete')}>
        <LuTrash2 className="h-4 w-4" />
      </Button>
      {dialog === 'rename' && (
        <TagNameModal
          title="Rename Tag"
          initialName={tag.name}
          confirmText="Rename"
          onSave={(name) => renameForumTag({ tagId: tag.id, name })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <Modal
          title="Delete Tag"
          content={
            <p>
              Delete <strong>{tag.name}</strong>? It comes off {tag.thread_count} {tag.thread_count === 1 ? 'thread' : 'threads'}.
            </p>
          }
          onClose={() => setDialog(null)}
          onConfirm={() => run(deleteForumTag(tag.id))}
          confirmText="Delete"
        />
      )}
    </div>
  );
}
