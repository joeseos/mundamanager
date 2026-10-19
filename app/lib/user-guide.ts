import { unstable_cache } from 'next/cache';
import { TAGS } from '@/utils/cache-tags';
import { getAppDb } from '@/utils/db/client';
import { EDITION_N23, EDITION_N26, type EditionSlug } from '@/types/edition';

export type UserGuideContentByEdition = Record<EditionSlug, string>;

/**
 * The user guide HTML for every edition, keyed by edition slug.
 *
 * The page is public, and RLS lets everyone read user_guides and editions, so
 * the direct connection reads the same rows for every visitor.
 *
 * Tag-driven: the admin write path (PUT /api/admin/user-guides) calls
 * invalidateUserGuides(), so this can be cached indefinitely.
 */
const getCachedUserGuides = unstable_cache(
  async (): Promise<UserGuideContentByEdition> => {
    const rows = await getAppDb().query.userGuides.findMany({
      columns: { content: true },
      with: { editions: { columns: { slug: true } } },
    });

    const guides: UserGuideContentByEdition = {
      [EDITION_N23]: '',
      [EDITION_N26]: '',
    };

    for (const { content, editions } of rows) {
      if (editions.slug === EDITION_N23 || editions.slug === EDITION_N26) {
        guides[editions.slug] = content;
      }
    }

    return guides;
  },
  // v2: first anon fetch (before public editions SELECT) cached empty
  // strings indefinitely (`revalidate: false`). Bump so that entry is ignored.
  ['user-guides-v2'],
  {
    tags: [TAGS.userGuides()],
    revalidate: false,
  }
);

export async function getUserGuides(): Promise<UserGuideContentByEdition> {
  return getCachedUserGuides();
}
