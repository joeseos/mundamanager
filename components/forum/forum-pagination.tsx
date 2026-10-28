import Link from 'next/link';
import { forumPageHref } from '@/app/lib/forum';

interface ForumPaginationProps {
  /** The path of the thread or category's first page. */
  path: string;
  page: number;
  pageCount: number;
  className?: string;
}

const pageButton = 'px-3 py-1 text-sm border rounded-md';

export type ForumPageSlot = { kind: 'page'; page: number } | { kind: 'ellipsis'; key: string };

/** Pages around `page`: the first, the last, and the neighbors. A one-page gap is shown; a wider gap is an ellipsis. */
export function forumPageWindow(page: number, pageCount: number): ForumPageSlot[] {
  const slots: ForumPageSlot[] = [];
  let previous: number | null = null;
  for (let n = 1; n <= pageCount; n++) {
    const showPage = n === 1 || n === pageCount || Math.abs(n - page) <= 1;
    if (!showPage) continue;
    if (previous !== null && n - previous === 2) slots.push({ kind: 'page', page: n - 1 });
    else if (previous !== null && n - previous > 2) slots.push({ kind: 'ellipsis', key: `gap-${previous}` });
    slots.push({ kind: 'page', page: n });
    previous = n;
  }
  return slots;
}

/** Prev, numbered pages, and Next. */
export function ForumPagination({ path, page, pageCount, className }: ForumPaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Pages" className={`flex items-center justify-center sm:justify-end gap-2 mt-4 ${className ?? ''}`}>
      {page > 1 ? (
        <Link href={forumPageHref(path, page - 1)} prefetch={false} className={`${pageButton} hover:bg-muted`}>
          Prev
        </Link>
      ) : (
        <span className={`${pageButton} opacity-50 cursor-not-allowed`}>Prev</span>
      )}

      <div className="flex items-center gap-1">
        {forumPageWindow(page, pageCount).map((slot) => {
          if (slot.kind === 'ellipsis') return <span key={slot.key} className="px-2 text-muted-foreground">...</span>;
          if (slot.page === page) {
            return (
              <span key={slot.page} aria-current="page" className={`${pageButton} bg-black text-white border-black`}>
                {slot.page}
              </span>
            );
          }
          return (
            <Link key={slot.page} href={forumPageHref(path, slot.page)} prefetch={false} className={`${pageButton} hover:bg-muted`}>
              {slot.page}
            </Link>
          );
        })}
      </div>

      {page < pageCount ? (
        <Link href={forumPageHref(path, page + 1)} prefetch={false} className={`${pageButton} hover:bg-muted`}>
          Next
        </Link>
      ) : (
        <span className={`${pageButton} opacity-50 cursor-not-allowed`}>Next</span>
      )}
    </nav>
  );
}
