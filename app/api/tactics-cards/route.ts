import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { gangEditionJoin } from '@/types/edition';
import {
  compareTacticsCards,
  tacticsCardsPackFilter,
  type TacticsCard,
  type TacticsCardsPack
} from '@/types/tactics-card';

/**
 * Every Gang Tactics deck a gang may draw from, each with its cards, for the
 * "Add Gang Tactics" picker. Returned in one response so ticking a pack needs
 * no refetch.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const gangId = new URL(request.url).searchParams.get('gang_id');
    if (!gangId) {
      return NextResponse.json(
        { error: 'Missing gang', details: 'gang_id is required' },
        { status: 400 }
      );
    }

    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select(`
        gang_types!gang_type_id ( gang_type_id, parent_gang_type_id, editions:edition_id ( id ) ),
        custom_gang_types!custom_gang_type_id ( editions:edition_id ( id ) )
      `)
      .eq('id', gangId)
      .maybeSingle();

    if (gangError) throw gangError;

    const editionId = gangEditionJoin(gang)?.id;
    if (!gang || !editionId) return NextResponse.json([]);

    const gangType = Array.isArray(gang.gang_types) ? gang.gang_types[0] : gang.gang_types;

    // tactics_cards reaches packs through two FKs, so the embed names the one it means.
    const { data: packs, error: packsError } = await supabase
      .from('tactics_cards_packs')
      .select(`
        id,
        name,
        gang_type_id,
        tactics_cards!tactics_cards_tactics_cards_pack_id_fkey ( id, name, d66_min, d66_max )
      `)
      .eq('edition_id', editionId)
      .or(tacticsCardsPackFilter(gangType?.gang_type_id, gangType?.parent_gang_type_id));

    if (packsError) throw packsError;

    const result: TacticsCardsPack[] = (packs ?? [])
      .map((pack: any) => ({
        id: pack.id,
        name: pack.name,
        is_core: pack.gang_type_id === null,
        cards: ((pack.tactics_cards ?? []) as TacticsCard[]).sort(compareTacticsCards)
      }))
      // The client splits core off, so this is the checkbox row's order.
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET /api/tactics-cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tactics cards' },
      { status: 500 }
    );
  }
}
