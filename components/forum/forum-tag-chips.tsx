import { cn } from '@/app/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { ForumTag } from '@/app/lib/forum';

/** A thread's tags, on the thread, its row and its article card. */
export function ForumTagChips({ tags, className }: { tags: ForumTag[]; className?: string }) {
  if (!tags.length) return null;

  return (
    <ul className={cn('flex flex-wrap gap-1', className)}>
      {tags.map((tag) => (
        <li key={tag.id}>
          <Badge variant="secondary" className="font-medium">
            {tag.name}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
