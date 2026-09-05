import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { compareTacticsCards } from '@/types/tactics-card';

/**
 * The packs a gang may draw from and the cards in them, for the "Add Gang
 * Tactics" picker. The caller passes the edition and gang type it already
 * holds, so this never resolves a gang — it is a filter, not a boundary. The
 * add and roll actions re-derive both from the gang itself.
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
    const gangTypeId = searchParams.get('gang_type_id');

    if (!editionSlug) {
      return NextResponse.json(
        { error: 'Missing edition', details: 'edition_slug is required' },
        { status: 400 }
      );
    }

    const gangTypeIds: string[] = [];
    if (gangTypeId) {
      // A gang list also gets the packs of the house it belongs to.
      const { data: gangType } = await supabase
        .from('gang_types')
        .select('parent_gang_type_id')
        .eq('gang_type_id', gangTypeId)
        .maybeSingle();

      gangTypeIds.push(gangTypeId);
      if (gangType?.parent_gang_type_id) gangTypeIds.push(gangType.parent_gang_type_id);
    }

    let packQuery = supabase
      .from('tactics_cards_packs')
      .select('id, name, gang_type_id, editions!inner ( slug )')
      .eq('editions.slug', editionSlug);

    packQuery = gangTypeIds.length
      ? packQuery.or(`gang_type_id.is.null,gang_type_id.in.(${gangTypeIds.join(',')})`)
      : packQuery.is('gang_type_id', null);

    // Unrestricted first, then oldest, so packs[0] is the edition's Core deck.
    const { data: packRows, error: packError } = await packQuery
      .order('gang_type_id', { nullsFirst: true })
      .order('created_at', { ascending: true });

    if (packError) throw packError;

    const packs = (packRows ?? []).map((pack: any) => ({
      id: pack.id,
      name: pack.name,
      gang_type_id: pack.gang_type_id ?? null
    }));

    if (packs.length === 0) {
      return NextResponse.json({ packs: [], cards: [] });
    }

    const { data: cards, error } = await supabase
      .from('tactics_cards')
      .select('id, name, d66_min, d66_max, pack_id')
      .in('pack_id', packs.map(pack => pack.id));

    if (error) throw error;

    return NextResponse.json({ packs, cards: (cards ?? []).sort(compareTacticsCards) });
  } catch (error) {
    console.error('Error in GET /api/tactics-cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tactics cards' },
      { status: 500 }
    );
  }
}
