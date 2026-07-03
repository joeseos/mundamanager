import { cacheLife } from 'next/cache';

/**
 * Current date for JSON-LD dateModified fields. Reading the clock during
 * prerender is not allowed under cacheComponents, so cache it instead
 * (refreshes daily).
 */
export async function getStructuredDataModifiedDate(): Promise<string> {
  'use cache';
  cacheLife('days');
  return new Date().toISOString().split('T')[0];
}
