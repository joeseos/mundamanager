import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { getTacticsPacksForGang } from '@/app/lib/shared/tactics-packs';
import { compareTacticsCards } from '@/types/tactics-card';

/**
 * The Gang Tactics catalogue for the "Add Gang Tactics" picker: the packs the
 * gang may draw from, and every card in them.
 *
 * The caller passes the edition slug and gang type it already holds, so this
 * never resolves a gang. That makes it a convenience filter, not a boundary — a
 * forged gang_type_id only widens a read of reference data every authenticated
 * user can already SELECT. The gate is in app/actions/gang-tactics-cards.ts,
 * which resolves the gang itself; both sides call getTacticsPacksForGang so the
 * picker cannot offer a pack the action would reject.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = new URL(request.url).searchParams;
    const editionSlug = searchParams.get('edition_slug');
    // Absent for a gang on a custom gang type: unrestricted packs only.
    const gangTypeId = searchParams.get('gang_type_id');

    if (!editionSlug) {
      return NextResponse.json(
        { error: 'Missing edition', details: 'edition_slug is required' },
        { status: 400 }
      );
    }

    const packs = await getTacticsPacksForGang(supabase, { editionSlug, gangTypeId });
    if (packs.length === 0) {
      return NextResponse.json({ packs: [], cards: [] });
    }

    const { data, error } = await supabase
      .from('tactics_cards')
      .select('id, name, d66_min, d66_max, pack_id')
      .in('pack_id', packs.map(pack => pack.id));

    if (error) throw error;

    return NextResponse.json({ packs, cards: (data ?? []).sort(compareTacticsCards) });
  } catch (error) {
    console.error('Error in GET /api/tactics-cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tactics cards' },
      { status: 500 }
    );
  }
}
