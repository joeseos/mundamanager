import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { getEditionIdBySlug } from '@/app/lib/editions';
import { getTacticsCards } from '@/app/lib/tactics-cards';
import { hasGangTacticsCards } from '@/types/edition';

/**
 * The Gang Tactics catalogue for one edition, for the "Add Gang Tactics" picker.
 * The caller passes the slug it already holds, so this never resolves a gang.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const editionSlug = new URL(request.url).searchParams.get('edition_slug');
    if (!editionSlug) {
      return NextResponse.json(
        { error: 'Missing edition', details: 'edition_slug is required' },
        { status: 400 }
      );
    }

    // Otherwise an edition without Gang Tactics returns an empty list, which
    // reads as "none seeded yet" rather than "not a thing here".
    if (!hasGangTacticsCards(editionSlug)) {
      return NextResponse.json(
        { error: 'Unsupported edition', details: `Gang Tactics are not available for '${editionSlug}'` },
        { status: 400 }
      );
    }

    const editionId = await getEditionIdBySlug(editionSlug);
    if (!editionId) {
      return NextResponse.json(
        { error: 'Unknown edition', details: `No edition with slug '${editionSlug}'` },
        { status: 400 }
      );
    }

    return NextResponse.json(await getTacticsCards(editionId));
  } catch (error) {
    console.error('Error in GET /api/tactics-cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tactics cards' },
      { status: 500 }
    );
  }
}
