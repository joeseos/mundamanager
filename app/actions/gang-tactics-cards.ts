'use server'

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { checkPermissionCached } from '@/utils/user-permissions';
import { invalidateGangTacticsCards } from '@/utils/cache-tags';
import type { GangLogActionResult } from './logs/gang-logs';
import {
  logRolledTacticsCard,
  logTacticsCardAdded,
  logTacticsCardRemoved
} from './logs/gang-tactics-logs';
import { gangEditionJoin, gangEditionSlug, hasGangTacticsCards } from '@/types/edition';
import {
  GANG_TACTICS_CARD_SELECT,
  normaliseTacticsDescription,
  TACTICS_DESCRIPTION_CHAR_LIMIT,
  toGangTacticsCard,
  type GangTacticsCard
} from '@/types/tactics-card';

interface GangTacticsResult {
  success: boolean;
  error?: string;
}

interface AddGangTacticsCardsResult extends GangTacticsResult {
  /** The rows just added, so the client can append without a refetch. */
  data?: GangTacticsCard[];
}

interface GangTacticsContext {
  editionId: string;
  /** The gang's own gang list and the house it belongs to. Empty for a custom gang type. */
  gangTypeIds: string[];
}

/** The pack embed every availability check reads. */
const CARD_PACK_SELECT = 'tactics_cards_packs!inner ( edition_id, gang_type_id )';

/**
 * Whether a card's pack is one this gang may draw from: unrestricted, its own
 * gang list's, or its house's.
 */
function isPackAvailable(row: any, { editionId, gangTypeIds }: GangTacticsContext): boolean {
  const pack = Array.isArray(row.tactics_cards_packs)
    ? row.tactics_cards_packs[0]
    : row.tactics_cards_packs;

  if (!pack || pack.edition_id !== editionId) return false;

  return pack.gang_type_id == null || gangTypeIds.includes(pack.gang_type_id);
}

/**
 * Authenticate, confirm the caller may edit this gang, and confirm the edition
 * has Gang Tactics. RLS enforces the first two again, but failing here returns
 * a usable message instead of a raw error.
 */
async function authoriseGangTactics(
  supabase: any,
  gangId: string
): Promise<{ error: string } | { context: GangTacticsContext }> {
  const user = await getAuthenticatedUser(supabase);

  const { data: gang, error } = await supabase
    .from('gangs')
    .select(`
      id,
      user_id,
      gang_type_id,
      gang_types!gang_type_id ( parent_gang_type_id, editions:edition_id ( id, slug ) ),
      custom_gang_types!custom_gang_type_id ( editions:edition_id ( id, slug ) )
    `)
    .eq('id', gangId)
    .maybeSingle();

  if (error || !gang) {
    return { error: 'Gang not found' };
  }

  const permissions = await checkPermissionCached(user.id, gangId, gang.user_id ?? null);
  if (!permissions.canEdit) {
    return { error: 'Access denied' };
  }

  if (!hasGangTacticsCards(gangEditionSlug(gang))) {
    return { error: 'Gang Tactics are not available for this edition' };
  }

  // Bail rather than fall through with a null edition, which would drop the
  // pack filter from every query below.
  const editionId = gangEditionJoin(gang)?.id;
  if (!editionId) {
    return { error: 'Gang Tactics are not available for this edition' };
  }

  const gangType = Array.isArray(gang.gang_types) ? gang.gang_types[0] : gang.gang_types;

  return {
    context: {
      editionId,
      gangTypeIds: [gang.gang_type_id, gangType?.parent_gang_type_id].filter(Boolean) as string[]
    }
  };
}

export async function addGangTacticsCards(params: {
  gangId: string;
  tacticsCardIds: string[];
}): Promise<AddGangTacticsCardsResult> {
  try {
    const supabase = await createClient();

    const auth = await authoriseGangTactics(supabase, params.gangId);
    if ('error' in auth) return { success: false, error: auth.error };

    const tacticsCardIds = Array.from(new Set(params.tacticsCardIds));
    if (tacticsCardIds.length === 0) {
      return { success: false, error: 'No tactics cards selected' };
    }

    // The browser can post any uuid, so don't trust what the picker sent. Packs
    // carry the edition, so checking the pack covers that too.
    const { data: catalogue, error: catalogueError } = await supabase
      .from('tactics_cards')
      .select(`id, ${CARD_PACK_SELECT}`)
      .in('id', tacticsCardIds);

    if (catalogueError) throw catalogueError;

    const available = (catalogue ?? []).filter(card => isPackAvailable(card, auth.context));
    if (available.length !== tacticsCardIds.length) {
      return { success: false, error: 'One or more tactics cards are not available for this gang' };
    }

    // ignoreDuplicates so a stale picker can't 23505 on (gang_id, tactics_cards_id).
    // Returns only the rows actually inserted, which is what the client appends
    // and what gets logged.
    const { data: inserted, error: insertError } = await supabase
      .from('gang_tactics_cards')
      .upsert(
        tacticsCardIds.map(id => ({ gang_id: params.gangId, tactics_cards_id: id })),
        { onConflict: 'gang_id,tactics_cards_id', ignoreDuplicates: true }
      )
      .select(GANG_TACTICS_CARD_SELECT);

    if (insertError) throw insertError;

    const added = (inserted ?? []).map(toGangTacticsCard);

    await Promise.all(
      added.map(card => logTacticsCardAdded({ gang_id: params.gangId, card_name: card.name }))
    );

    invalidateGangTacticsCards(params.gangId);

    return { success: true, data: added };
  } catch (error) {
    console.error('Error adding gang tactics cards:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function verifyAndLogRolledTacticsCard(params: {
  gangId: string;
  /** The pack whose D66 table was rolled on. */
  packId: string;
  total: number;
  dice: number[];
}): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();

    const auth = await authoriseGangTactics(supabase, params.gangId);
    if ('error' in auth) return { success: false, error: auth.error };

    // Scoped to the posted pack, not the whole edition: each pack has its own
    // D66 table, so an edition-wide lookup matches one card per pack. The card
    // is still resolved from the dice rather than a posted id, so the client
    // says which table it rolled on, never which card came up — and the pack
    // restriction means a pack this gang can't use matches nothing.
    const { data: rolled, error } = await supabase
      .from('tactics_cards')
      .select(`name, ${CARD_PACK_SELECT}`)
      .eq('pack_id', params.packId)
      .lte('d66_min', params.total)
      .gte('d66_max', params.total)
      .order('d66_min', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const card = rolled && isPackAvailable(rolled, auth.context) ? rolled : null;
    if (!card) return { success: false, error: 'No tactics card matches that roll' };

    return await logRolledTacticsCard({
      gang_id: params.gangId,
      card_name: card.name,
      total: params.total,
      dice: params.dice
    });
  } catch (error) {
    console.error('Error logging tactics card roll:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function updateGangTacticsCardDescription(params: {
  gangId: string;
  gangTacticsCardId: string;
  description: string | null;
}): Promise<GangTacticsResult> {
  try {
    const supabase = await createClient();

    const auth = await authoriseGangTactics(supabase, params.gangId);
    if ('error' in auth) return { success: false, error: auth.error };

    const description = normaliseTacticsDescription(params.description);
    if (description && description.length > TACTICS_DESCRIPTION_CHAR_LIMIT) {
      return {
        success: false,
        error: `Description must be ${TACTICS_DESCRIPTION_CHAR_LIMIT} characters or fewer.`
      };
    }

    const { error } = await supabase
      .from('gang_tactics_cards')
      .update({ description, updated_at: new Date().toISOString() })
      .eq('id', params.gangTacticsCardId)
      .eq('gang_id', params.gangId);

    if (error) throw error;

    invalidateGangTacticsCards(params.gangId);

    return { success: true };
  } catch (error) {
    console.error('Error updating gang tactics card description:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function deleteGangTacticsCard(params: {
  gangId: string;
  gangTacticsCardId: string;
}): Promise<GangTacticsResult> {
  try {
    const supabase = await createClient();

    const auth = await authoriseGangTactics(supabase, params.gangId);
    if ('error' in auth) return { success: false, error: auth.error };

    const { data: existing } = await supabase
      .from('gang_tactics_cards')
      .select('tactics_cards:tactics_cards_id ( name )')
      .eq('id', params.gangTacticsCardId)
      .eq('gang_id', params.gangId)
      .maybeSingle();

    const { error } = await supabase
      .from('gang_tactics_cards')
      .delete()
      .eq('id', params.gangTacticsCardId)
      .eq('gang_id', params.gangId);

    if (error) throw error;

    const card = Array.isArray(existing?.tactics_cards) ? existing?.tactics_cards[0] : existing?.tactics_cards;
    if (card?.name) {
      await logTacticsCardRemoved({ gang_id: params.gangId, card_name: card.name });
    }

    invalidateGangTacticsCards(params.gangId);

    return { success: true };
  } catch (error) {
    console.error('Error deleting gang tactics card:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
