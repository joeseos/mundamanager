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

type ForumPageSlot = { kind: 'page'; page: number } | { kind: 'ellipsis'; key: string };

/** Pages around `page`: the first, the last, and the neighbors. A one-page gap is shown; a wider gap is an ellipsis. */
function forumPageWindow(page: number, pageCount: number): ForumPageSlot[] {
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

/** Small page links on a category row. Page 1 is the thread itself, so the window starts there. */
export function ForumThreadPageLinks({ path, pageCount }: { path: string; pageCount: number }) {
  if (pageCount <= 1) return null;

  return (
    <span className="relative z-10 flex shrink-0 items-center gap-1">
      {forumPageWindow(1, pageCount).map((slot) =>
        slot.kind === 'ellipsis' ? (
          <span key={slot.key} className="px-0.5 text-xs text-muted-foreground">...</span>
        ) : (
          <Link
            key={slot.page}
            href={forumPageHref(path, slot.page)}
            prefetch={false}
            aria-label={`Page ${slot.page}`}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-xs tabular-nums hover:text-red-800 hover:border-red-800"
          >
            {slot.page}
          </Link>
        ),
      )}
    </span>
  );
}
