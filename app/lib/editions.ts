import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';
import { EDITION_N23, type Edition } from '@/types/edition';

/**
 * The editions table, cached process-wide.
 *
 * Every authenticated user reads the same rows (see the blanket SELECT policy
 * in 20260630095837_add_editions_and_root_edition_ids.sql), so this is read
 * with the service role rather than once per user per request.
 *
 * Revalidation is time-based because editions are seeded by migration and the
 * app has no write path to the table — nothing can call revalidateTag for us,
 * so caching indefinitely would hide a newly seeded edition until the next
 * deploy. One hour matches the other rarely-changing reference data
 * (gang variants, alliances, fighter types in app/lib/shared/*).
 *
 * The tag is still there for the impatient case: after running a migration,
 * `revalidateTag(CACHE_TAGS.GLOBAL_EDITIONS(), { expire: 0 })` picks the new
 * edition up immediately instead of waiting out the hour.
 */
const getCachedEditions = unstable_cache(
  async (): Promise<Edition[]> => {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('editions')
      .select('id, name, slug, is_current, released_at')
      .order('released_at', { ascending: false, nullsFirst: false })
      .order('name');

    if (error) {
      console.error('Error fetching editions:', error);
      throw new Error(`Failed to fetch editions: ${error.message}`);
    }

    return data || [];
  },
  ['global-editions'],
  {
    tags: [CACHE_TAGS.GLOBAL_EDITIONS()],
    revalidate: 3600, // 1 hour — editions only ever change via migration
  }
);

export async function getEditions(): Promise<Edition[]> {
  return getCachedEditions();
}

/**
 * Resolve an edition slug to its uuid, server-side.
 *
 * Rows are written with an edition uuid but the app reasons in slugs
 * (see @/types/edition), so this translation belongs on the write path — never
 * in the browser, which would have to fetch the editions table to do it.
 *
 * Returns null for a slug that is not in the table, which callers store as a
 * null edition_id (read back as N23 by `sameEditionSlug`).
 */
export async function getEditionIdBySlug(
  slug: string = EDITION_N23
): Promise<string | null> {
  const editions = await getEditions();
  return editions.find(edition => edition.slug === slug)?.id ?? null;
}
