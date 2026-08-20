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
  editionId: string | null;
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
      gang_types!gang_type_id ( editions:edition_id ( id, slug ) ),
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

  return { context: { editionId: gangEditionJoin(gang)?.id ?? null } };
}

async function selectGangTacticsCards(
  supabase: any,
  gangId: string,
  tacticsCardIds: string[]
): Promise<GangTacticsCard[]> {
  if (tacticsCardIds.length === 0) return [];

  const { data, error } = await supabase
    .from('gang_tactics_cards')
    .select(GANG_TACTICS_CARD_SELECT)
    .eq('gang_id', gangId)
    .in('tactics_cards_id', tacticsCardIds);

  if (error) throw error;

  return (data ?? []).map(toGangTacticsCard);
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

    // The browser can post any uuid, so don't trust what the picker sent.
    let catalogueQuery = supabase
      .from('tactics_cards')
      .select('id, name')
      .in('id', tacticsCardIds);

    if (auth.context.editionId) {
      catalogueQuery = catalogueQuery.eq('edition_id', auth.context.editionId);
    }

    const { data: catalogue, error: catalogueError } = await catalogueQuery;
    if (catalogueError) throw catalogueError;

    if ((catalogue?.length ?? 0) !== tacticsCardIds.length) {
      return { success: false, error: 'One or more tactics cards are not available for this gang' };
    }

    // ignoreDuplicates so a stale picker can't 23505 on (gang_id, tactics_cards_id).
    // The returned rows are only the ones actually inserted, which is what gets logged.
    const { data: inserted, error: insertError } = await supabase
      .from('gang_tactics_cards')
      .upsert(
        tacticsCardIds.map(id => ({ gang_id: params.gangId, tactics_cards_id: id })),
        { onConflict: 'gang_id,tactics_cards_id', ignoreDuplicates: true }
      )
      .select('tactics_cards_id');

    if (insertError) throw insertError;

    const added = await selectGangTacticsCards(supabase, params.gangId, tacticsCardIds);

    const nameById = new Map((catalogue ?? []).map((card: any) => [card.id, card.name]));
    await Promise.all(
      (inserted ?? []).map((row: any) =>
        logTacticsCardAdded({
          gang_id: params.gangId,
          card_name: nameById.get(row.tactics_cards_id) ?? 'Unknown Tactic'
        })
      )
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
  total: number;
  dice: number[];
}): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();

    const auth = await authoriseGangTactics(supabase, params.gangId);
    if ('error' in auth) return { success: false, error: auth.error };

    // Resolved from the dice rather than a posted id, so a roll can't be
    // credited to a card it didn't produce.
    let query = supabase
      .from('tactics_cards')
      .select('name')
      .lte('d66_min', params.total)
      .gte('d66_max', params.total);

    if (auth.context.editionId) {
      query = query.eq('edition_id', auth.context.editionId);
    }

    const { data: card, error } = await query.maybeSingle();
    if (error) throw error;
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
