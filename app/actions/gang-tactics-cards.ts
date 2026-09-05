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
import { getTacticsPacksForGang } from '@/app/lib/shared/tactics-packs';
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
  /** null for a gang on a custom gang type: unrestricted packs only. */
  gangTypeId: string | null;
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

  // Slug and id come from the same editions embed, so a slug that passed the
  // check above implies a resolved id. Bail rather than fall through with a
  // null edition, which would drop the pack filter on every query below.
  const editionId = gangEditionJoin(gang)?.id;
  if (!editionId) {
    return { error: 'Gang Tactics are not available for this edition' };
  }

  return {
    context: {
      editionId,
      gangTypeId: gang.gang_type_id ?? null
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
    // are edition-scoped, so checking the pack covers the edition too, and adds
    // the gang-type restriction on top.
    const packs = await getTacticsPacksForGang(supabase, {
      editionId: auth.context.editionId,
      gangTypeId: auth.context.gangTypeId
    });
    const allowedPackIds = new Set(packs.map(pack => pack.id));

    const { data: catalogue, error: catalogueError } = await supabase
      .from('tactics_cards')
      .select('id, pack_id')
      .in('id', tacticsCardIds);

    if (catalogueError) throw catalogueError;

    const allAvailable =
      (catalogue?.length ?? 0) === tacticsCardIds.length &&
      (catalogue ?? []).every((card: { pack_id: string }) => allowedPackIds.has(card.pack_id));

    if (!allAvailable) {
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

    // The pack id is posted by the browser, so re-derive the allowed set rather
    // than trusting it.
    const packs = await getTacticsPacksForGang(supabase, {
      editionId: auth.context.editionId,
      gangTypeId: auth.context.gangTypeId
    });

    if (!packs.some(pack => pack.id === params.packId)) {
      return { success: false, error: 'That tactics pack is not available for this gang' };
    }

    // Scoped to the one pack, not the whole edition: every pack has its own D66
    // table, so an edition-wide lookup matches one card per pack and returns
    // several rows. Still resolved from the dice rather than a posted card id,
    // so a roll can't be credited to a card it didn't produce — the client says
    // which table it rolled on, never which card came up.
    const { data: card, error } = await supabase
      .from('tactics_cards')
      .select('name')
      .eq('pack_id', params.packId)
      .lte('d66_min', params.total)
      .gte('d66_max', params.total)
      .order('d66_min', { ascending: true })
      .limit(1)
      .maybeSingle();

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
