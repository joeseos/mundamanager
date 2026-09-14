import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkAdmin, getAuthenticatedUser } from '@/utils/auth';
import { getEditionIdBySlug } from '@/utils/editions';
import { invalidateUserGuides } from '@/utils/cache-tags';
import {
  EDITION_N23,
  EDITION_N26,
  editionSlugFromJoin,
  type EditionJoin,
  type EditionSlug,
} from '@/types/edition';
import { isHtmlEffectivelyEmpty } from '@/utils/htmlCleanUp';

const EDITION_SLUGS: readonly EditionSlug[] = [EDITION_N23, EDITION_N26];

type PutBody = {
  editionSlug?: unknown;
  content?: unknown;
};

/** Current guide HTML for every edition (uncached: admins need the live value). */
export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_guides')
      .select('content, updated_at, editions:edition_id (slug)');

    if (error) throw error;

    const guides: Record<EditionSlug, string> = {
      [EDITION_N23]: '',
      [EDITION_N26]: '',
    };

    for (const row of (data ?? []) as { content: string; editions: EditionJoin }[]) {
      const slug = editionSlugFromJoin(row.editions);
      if (slug === EDITION_N23 || slug === EDITION_N26) {
        guides[slug] = row.content ?? '';
      }
    }

    return NextResponse.json(guides);
  } catch (error) {
    console.error('Error fetching user guides:', error);
    return NextResponse.json({ error: 'Failed to fetch user guides' }, { status: 500 });
  }
}

/** Replace one edition's guide. Body: { editionSlug: 'n23' | 'n26', content: string } */
export async function PUT(request: Request) {
  const supabase = await createClient();

  try {
    const user = await getAuthenticatedUser(supabase).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await checkAdmin(supabase, user);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as PutBody;

    if (
      typeof body.editionSlug !== 'string' ||
      !EDITION_SLUGS.includes(body.editionSlug as EditionSlug)
    ) {
      return NextResponse.json(
        { error: `editionSlug must be one of: ${EDITION_SLUGS.join(', ')}` },
        { status: 400 }
      );
    }
    const editionSlug = body.editionSlug as EditionSlug;

    if (typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
    }
    // Same normalisation as Campaign Pack: an "empty" editor saves as ''.
    const content = isHtmlEffectivelyEmpty(body.content) ? '' : body.content;

    const editionId = await getEditionIdBySlug(editionSlug);
    if (!editionId) {
      return NextResponse.json({ error: `Unknown edition: ${editionSlug}` }, { status: 400 });
    }

    const { error } = await supabase
      .from('user_guides')
      .upsert(
        {
          edition_id: editionId,
          content,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: 'edition_id' }
      );

    if (error) throw error;

    invalidateUserGuides();

    return NextResponse.json({ success: true, editionSlug });
  } catch (error) {
    console.error('Error updating user guide:', error);
    return NextResponse.json({ error: 'Failed to update user guide' }, { status: 500 });
  }
}
