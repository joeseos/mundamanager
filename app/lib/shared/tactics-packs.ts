import type { TacticsCardPack } from '@/types/tactics-card';

interface TacticsPacksParams {
  /** Supply exactly one of these. editionId wins if both are given. */
  editionId?: string | null;
  editionSlug?: string | null;
  /** null for a gang on a custom gang type: unrestricted packs only. */
  gangTypeId?: string | null;
}

const PACK_SELECT = 'id, name, gang_type_id, editions!inner ( slug )';

/**
 * The packs a gang may draw from: every pack in its edition that is either
 * unrestricted (`gang_type_id` null) or tied to the gang's own gang list — or
 * to the house that list belongs to, so a House Escher deck reaches
 * "House Escher: Wyld Hunt". The parent tree is one level deep, so this is a
 * two-element match rather than a recursive walk.
 *
 * Both the picker route and the server actions go through here. The picker must
 * not be able to offer a pack the action would then reject, and keeping the one
 * rule in one place is what stops the two drifting.
 *
 * Ordered unrestricted-first then oldest-first, so `packs[0]` is the edition's
 * Core deck without keying off the name.
 */
export async function getTacticsPacksForGang(
  supabase: any,
  { editionId, editionSlug, gangTypeId }: TacticsPacksParams
): Promise<TacticsCardPack[]> {
  if (!editionId && !editionSlug) return [];

  // Resolved here rather than by each caller, so no caller has to know that a
  // gang list inherits its house's packs.
  const gangTypeIds: string[] = [];
  if (gangTypeId) {
    gangTypeIds.push(gangTypeId);

    const { data: gangType } = await supabase
      .from('gang_types')
      .select('parent_gang_type_id')
      .eq('gang_type_id', gangTypeId)
      .maybeSingle();

    if (gangType?.parent_gang_type_id) {
      gangTypeIds.push(gangType.parent_gang_type_id);
    }
  }

  let query = supabase.from('tactics_cards_packs').select(PACK_SELECT);

  query = editionId
    ? query.eq('edition_id', editionId)
    : query.eq('editions.slug', editionSlug);

  query = gangTypeIds.length
    ? query.or(`gang_type_id.is.null,gang_type_id.in.(${gangTypeIds.join(',')})`)
    : query.is('gang_type_id', null);

  const { data, error } = await query
    .order('gang_type_id', { nullsFirst: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((pack: any) => ({
    id: pack.id,
    name: pack.name,
    gang_type_id: pack.gang_type_id ?? null
  }));
}
