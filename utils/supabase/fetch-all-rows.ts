const PAGE_SIZE = 1000;

/**
 * Fetch every row of a query, paging past PostgREST's max-rows cap (1000 by
 * default) which otherwise truncates the response with no error.
 *
 * `buildPage` must rebuild the query on each call — Supabase query builders are
 * single-use — and apply a deterministic order, including a unique tiebreaker,
 * so rows can't shift between pages. Advancing by the rows actually returned
 * keeps this correct even if max-rows is lower than PAGE_SIZE.
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await buildPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    if (page.length === 0) return rows;
    rows.push(...page);
  }
}
