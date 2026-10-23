'use client';

interface PaginationProps {
  /** Plural name of what is paged, as in "Logs 1 to 10 of 42" */
  itemLabel: string;
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

/** Prev, numbered pages with ellipses, and Next; renders nothing when everything fits on one page. */
export function Pagination({ itemLabel, currentPage, pageSize, totalItems, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const startIndex = (currentPage - 1) * pageSize;
  const goToPage = (page: number) => {
    onPageChange(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 border-t border-border bg-muted mt-4">
      <div className="text-sm text-muted-foreground text-center sm:text-left">
        {itemLabel} {startIndex + 1} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems}
      </div>
      <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1 sm:gap-2">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className="px-2 sm:px-3 py-1 text-sm border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {/* Arrows on phones, so the controls fit on one line with three-digit page numbers */}
          <span className="sm:hidden">‹</span>
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
            const showPage = page === 1 ||
                           page === totalPages ||
                           Math.abs(page - currentPage) <= 1;

            if (!showPage) {
              if (page === 2 && currentPage > 4) {
                return <span key={page} className="px-1 sm:px-2 text-muted-foreground">...</span>;
              }
              if (page === totalPages - 1 && currentPage < totalPages - 3) {
                return <span key={page} className="px-1 sm:px-2 text-muted-foreground">...</span>;
              }
              return null;
            }

            return (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`px-2 sm:px-3 py-1 text-sm border rounded-md ${
                  currentPage === page
                    ? 'bg-black text-white border-black'
                    : 'hover:bg-muted'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className="px-2 sm:px-3 py-1 text-sm border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="sm:hidden">›</span>
          <span className="hidden sm:inline">Next</span>
        </button>
      </div>
    </div>
  );
}
