import { sql, type AnyColumn } from 'drizzle-orm';

/**
 * Every column of a custom row, with the row's own timestamps selected the way
 * the Data API formatted them (see utils/db/schema.ts).
 */
export const CUSTOM_ROW = {
  columns: { created_at: false, updated_at: false },
  extras: (row: { created_at: AnyColumn; updated_at: AnyColumn }) => ({
    created_at: sql<string>`to_json(${row.created_at})`.as('created_at'),
    updated_at: sql<string | null>`to_json(${row.updated_at})`.as('updated_at'),
  }),
} as const;
