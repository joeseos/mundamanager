import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { TAGS } from '@/utils/cache-tags';
import { EDITION_N23, EDITION_N26, type EditionSlug } from '@/types/edition';

export type UserGuideContentByEdition = Record<EditionSlug, string>;

/**
 * The user guide HTML for every edition, keyed by edition slug.
 *
 * Read with the anon key (no cookies, no session): the page is public and RLS
 * grants SELECT on user_guides and editions to everyone, so no service role is
 * needed — same pattern as getUserCount(). Editions are fetched separately and
 * mapped in JS rather than embedded, so the result does not depend on
 * PostgREST embed behaviour under RLS.
 *
 * Tag-driven: the admin write path (PUT /api/admin/user-guides) calls
 * invalidateUserGuides(), so this can be cached indefinitely.
 */
const getCachedUserGuides = unstable_cache(
  async (): Promise<UserGuideContentByEdition> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const [guidesResult, editionsResult] = await Promise.all([
      supabase.from('user_guides').select('content, edition_id'),
      supabase.from('editions').select('id, slug'),
    ]);

    if (guidesResult.error) {
      console.error('Error fetching user guides:', guidesResult.error);
      throw new Error(`Failed to fetch user guides: ${guidesResult.error.message}`);
    }
    if (editionsResult.error) {
      console.error('Error fetching editions for user guides:', editionsResult.error);
      throw new Error(`Failed to fetch editions: ${editionsResult.error.message}`);
    }

    const slugById = new Map<string, string>(
      (editionsResult.data ?? []).map((edition) => [edition.id as string, edition.slug as string])
    );

    const guides: UserGuideContentByEdition = {
      [EDITION_N23]: '',
      [EDITION_N26]: '',
    };

    for (const row of (guidesResult.data ?? []) as { content: string | null; edition_id: string }[]) {
      const slug = slugById.get(row.edition_id);
      if (slug === EDITION_N23 || slug === EDITION_N26) {
        guides[slug] = row.content ?? '';
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
