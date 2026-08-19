'use server'

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { checkPermissionCached } from '@/utils/user-permissions';
import { invalidateGangTacticsCards } from '@/utils/cache-tags';
import { gangEditionJoin, gangEditionSlug, hasGangTacticsCards } from '@/types/edition';
import {
  GANG_TACTICS_CARD_SELECT,
  normaliseTacticsDescription,
  TACTICS_DESCRIPTION_CHAR_LIMIT,
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

  return (data ?? []) as unknown as GangTacticsCard[];
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

    // The browser can post any uuid, so don't trust what the picker sent. The
    // same read supplies the name and D66 snapshotted onto the gang row.
    let catalogueQuery = supabase
      .from('tactics_cards')
      .select('id, name, d66_min, d66_max')
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
    const { error: insertError } = await supabase
      .from('gang_tactics_cards')
      .upsert(
        (catalogue ?? []).map((card: any) => ({
          gang_id: params.gangId,
          tactics_cards_id: card.id,
          name: card.name,
          d66_min: card.d66_min,
          d66_max: card.d66_max
        })),
        { onConflict: 'gang_id,tactics_cards_id', ignoreDuplicates: true }
      );

    if (insertError) throw insertError;

    const added = await selectGangTacticsCards(supabase, params.gangId, tacticsCardIds);

    invalidateGangTacticsCards(params.gangId);

    return { success: true, data: added };
  } catch (error) {
    console.error('Error adding gang tactics cards:', error);
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

    const { error } = await supabase
      .from('gang_tactics_cards')
      .delete()
      .eq('id', params.gangTacticsCardId)
      .eq('gang_id', params.gangId);

    if (error) throw error;

    invalidateGangTacticsCards(params.gangId);

    return { success: true };
  } catch (error) {
    console.error('Error deleting gang tactics card:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
