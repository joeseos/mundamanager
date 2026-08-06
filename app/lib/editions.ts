import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';
import { EDITION_N23, type Edition } from '@/types/edition';

/**
 * The editions table, cached process-wide.
 *
 * Editions are seeded by migration and never written at runtime, and every
 * authenticated user reads the same rows (see the blanket SELECT policy in
 * 20260630095837_add_editions_and_root_edition_ids.sql), so this is cached with
 * no time-based revalidation and read with the service role rather than per
 * request per user.
 *
 * Revalidation: `revalidateTag(CACHE_TAGS.GLOBAL_EDITIONS(), { expire: 0 })`
 * after a migration adds an edition.
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
    revalidate: false,
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
