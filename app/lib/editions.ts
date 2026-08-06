import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';
import { EDITION_N23, type Edition } from '@/types/edition';

/**
 * The editions table. Service role because every user reads the same rows.
 *
 * Revalidation has to be time-based: editions are seeded by migration and the
 * app has no write path to the table, so nothing can call revalidateTag and
 * caching indefinitely would hide a new edition until the next deploy.
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
 * Rows are written with an edition uuid but the app reasons in slugs, so this
 * translation belongs on the write path — never in the browser, which would
 * have to fetch the editions table to do it.
 */
export async function getEditionIdBySlug(
  slug: string = EDITION_N23
): Promise<string | null> {
  const editions = await getEditions();
  return editions.find(edition => edition.slug === slug)?.id ?? null;
}
