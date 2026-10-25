import Link from 'next/link';
import { cn } from '@/app/lib/utils';
import { badgeVariants } from '@/components/ui/badge';
import { forumArticlesTagPath, forumTagPath, type ForumTag } from '@/app/lib/forum';

interface ForumTagChipsProps {
  tags: ForumTag[];
  /** Links to the articles with the tag instead of its forum page. */
  articles?: boolean;
  className?: string;
}

/** A thread's tags, each a link. Raised above stretched row and card links, so they stay clickable. */
export function ForumTagChips({ tags, articles = false, className }: ForumTagChipsProps) {
  if (!tags.length) return null;

  return (
    <ul className={cn('flex flex-wrap gap-1', className)}>
      {tags.map((tag) => (
        <li key={tag.id}>
          <Link
            href={articles ? forumArticlesTagPath(tag.slug) : forumTagPath(tag.slug)}
            prefetch={false}
            className={cn(badgeVariants({ variant: 'secondary' }), 'relative z-10 font-medium hover:text-red-800')}
          >
            {tag.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
