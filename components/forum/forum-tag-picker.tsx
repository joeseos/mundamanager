import { cn } from '@/app/lib/utils';
import { badgeVariants } from '@/components/ui/badge';
import type { ForumTag } from '@/app/lib/forum';

// Same limit as set_forum_thread_tags()
export const FORUM_THREAD_TAGS_MAX = 3;

interface ForumTagPickerProps {
  tags: ForumTag[];
  selected: string[];
  onChange: (tagIds: string[]) => void;
}

/** Toggles a thread's tags, up to the limit. */
export function ForumTagPicker({ tags, selected, onChange }: ForumTagPickerProps) {
  const full = selected.length >= FORUM_THREAD_TAGS_MAX;

  return (
    <fieldset>
      <legend className="text-sm font-medium text-muted-foreground mb-1">Tags (up to {FORUM_THREAD_TAGS_MAX})</legend>
      {tags.length ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => {
            const picked = selected.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={picked}
                disabled={!picked && full}
                onClick={() => onChange(picked ? selected.filter((id) => id !== tag.id) : [...selected, tag.id])}
                className={cn(badgeVariants({ variant: picked ? 'default' : 'outline' }), 'font-medium disabled:opacity-50')}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No tags yet.</p>
      )}
    </fieldset>
  );
}
