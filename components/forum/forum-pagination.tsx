import Link from 'next/link';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { forumPageHref } from '@/app/lib/forum';

interface ForumPaginationProps {
  /** The path of the thread or category's first page. */
  path: string;
  page: number;
  pageCount: number;
}

/** Previous / Page n of m / Next, as links so every page has its own URL. */
export function ForumPagination({ path, page, pageCount }: ForumPaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Pages" className="flex justify-between items-center mt-4">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm" className="flex items-center gap-1">
          <Link href={forumPageHref(path, page - 1)} prefetch={false}>
            <LuChevronLeft className="h-4 w-4" />
            Previous
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Button asChild variant="outline" size="sm" className="flex items-center gap-1">
          <Link href={forumPageHref(path, page + 1)} prefetch={false}>
            Next
            <LuChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
