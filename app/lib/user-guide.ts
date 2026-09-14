import { unstable_cache } from 'next/cache';
import { TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';
import {
  EDITION_N23,
  EDITION_N26,
  editionSlugFromJoin,
  type EditionJoin,
  type EditionSlug,
} from '@/types/edition';

export type UserGuideContentByEdition = Record<EditionSlug, string>;

/**
 * The user guide HTML for every edition, keyed by edition slug. Service role
 * because every visitor reads the same rows and the page is public.
 *
 * Tag-driven: the admin write path (PUT /api/admin/user-guides) calls
 * invalidateUserGuides(), so this can be cached indefinitely.
 */
const getCachedUserGuides = unstable_cache(
  async (): Promise<UserGuideContentByEdition> => {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('user_guides')
      .select('content, editions:edition_id (slug)');

    if (error) {
      console.error('Error fetching user guides:', error);
      throw new Error(`Failed to fetch user guides: ${error.message}`);
    }

    const guides: UserGuideContentByEdition = {
      [EDITION_N23]: '',
      [EDITION_N26]: '',
    };

    for (const row of (data ?? []) as { content: string; editions: EditionJoin }[]) {
      const slug = editionSlugFromJoin(row.editions);
      if (slug === EDITION_N23 || slug === EDITION_N26) {
        guides[slug] = row.content ?? '';
      }
    }

    return guides;
  },
  ['user-guides-v1'],
  {
    tags: [TAGS.userGuides()],
    revalidate: false,
  }
);

export async function getUserGuides(): Promise<UserGuideContentByEdition> {
  return getCachedUserGuides();
}
