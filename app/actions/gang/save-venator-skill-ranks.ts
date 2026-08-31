'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { syncGang } from '@/utils/syncVenatorSkillOverrides';
import { invalidateGang } from '@/utils/cache-tags';
import { isVenatorGang } from '@/utils/venatorSkillAccess';
import { gangEditionSlug } from '@/types/edition';

interface SaveVenatorSkillRanksParams {
  gangId: string;
  ranks: Array<{ rank: number; skill_type_id: string }>;
}

export async function saveVenatorSkillRanks(
  params: SaveVenatorSkillRanksParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { gangId, ranks } = params;

  if (ranks.length !== 0 && ranks.length !== 4) {
    return { ok: false, error: 'All four ranks must be set, or none.' };
  }
  if (ranks.length === 4) {
    const rankValues = ranks.map((r) => r.rank).sort((a, b) => a - b);
    if (rankValues.join(',') !== '1,2,3,4') {
      return { ok: false, error: 'Ranks must be exactly 1, 2, 3, 4.' };
    }
    const skillIds = ranks.map((r) => r.skill_type_id);
    if (new Set(skillIds).size !== 4) {
      return { ok: false, error: 'The same Skill Set cannot occupy two ranks.' };
    }
  }

  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const { data: gang, error: gangErr } = await supabase
    .from('gangs')
    .select(`
      gang_type,
      custom_gang_type_id,
      gang_types!gang_type_id ( editions:edition_id ( slug ) ),
      custom_gang_types!custom_gang_type_id ( editions:edition_id ( slug ) )
    `)
    .eq('id', gangId)
    .single();
  if (gangErr || !gang) return { ok: false, error: 'Gang not found.' };
  if (!isVenatorGang(gangEditionSlug(gang), gang.gang_type, Boolean(gang.custom_gang_type_id))) {
    return { ok: false, error: 'This gang cannot rank Skill Sets.' };
  }

  const FAILED_TO_SAVE = "Failed to save your gang's Skill Set ranks. Please try again.";

  const { data: previousRanks, error: previousRanksErr } = await supabase
    .from('gang_skill_set_ranks')
    .select('skill_type_id')
    .eq('gang_id', gangId);
  if (previousRanksErr) {
    console.error('saveVenatorSkillRanks: previous-ranks read failed', previousRanksErr);
    return { ok: false, error: FAILED_TO_SAVE };
  }
  const previouslyOwnedSkillTypeIds = (previousRanks ?? []).map((r) => r.skill_type_id as string);

  const { error: deleteErr } = await supabase
    .from('gang_skill_set_ranks')
    .delete()
    .eq('gang_id', gangId);
  if (deleteErr) {
    console.error('saveVenatorSkillRanks: rank delete failed', deleteErr);
    return { ok: false, error: FAILED_TO_SAVE };
  }

  if (ranks.length > 0) {
    const { error: insertErr } = await supabase
      .from('gang_skill_set_ranks')
      .insert(
        ranks.map((r) => ({
          gang_id: gangId,
          rank: r.rank,
          skill_type_id: r.skill_type_id,
        })),
      );
    if (insertErr) {
      console.error('saveVenatorSkillRanks: rank insert failed', insertErr);
      return { ok: false, error: FAILED_TO_SAVE };
    }
  }

  try {
    await syncGang(
      gangId,
      gang.gang_type,
      gangEditionSlug(gang),
      Boolean(gang.custom_gang_type_id),
      supabase,
      user.id,
      previouslyOwnedSkillTypeIds,
    );
  } catch (err) {
    console.error('saveVenatorSkillRanks: syncGang failed', err);
    return { ok: false, error: FAILED_TO_SAVE };
  }

  invalidateGang(gangId);

  return { ok: true };
}
