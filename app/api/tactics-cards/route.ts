import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { withEditionSlug } from '@/types/edition';
import { compareTacticsCards } from '@/types/tactics-card';

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

    const { data, error } = await supabase
      .from('tactics_cards')
      .select('id, name, d66_min, d66_max, editions!inner ( slug )')
      .eq('editions.slug', editionSlug);

    if (error) throw error;

    return NextResponse.json((data ?? []).map(withEditionSlug).sort(compareTacticsCards));
  } catch (error) {
    console.error('Error in GET /api/tactics-cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tactics cards' },
      { status: 500 }
    );
  }
}
