'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { replaceGangRanks } from '@/utils/syncVenatorSkillOverrides';
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

  if (ranks.length > 4) {
    return { ok: false, error: 'At most four Skill Sets can be ranked.' };
  }
  if (ranks.length > 0) {
    const rankValues = ranks.map((r) => r.rank).sort((a, b) => a - b);
    const expected = Array.from({ length: ranks.length }, (_, i) => i + 1).join(',');
    if (rankValues.join(',') !== expected) {
      return { ok: false, error: 'Ranks must be consecutive starting from 1.' };
    }
    const skillIds = ranks.map((r) => r.skill_type_id);
    if (skillIds.some((id) => !id) || new Set(skillIds).size !== ranks.length) {
      return { ok: false, error: 'The same Skill Set cannot occupy two ranks.' };
    }
  }

  const supabase = await createClient();
  await getAuthenticatedUser(supabase);

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

  try {
    await replaceGangRanks(
      gangId,
      ranks,
      gang.gang_type,
      gangEditionSlug(gang),
      Boolean(gang.custom_gang_type_id),
      supabase,
    );
  } catch (err) {
    console.error('saveVenatorSkillRanks: replaceGangRanks failed', err);
    return { ok: false, error: FAILED_TO_SAVE };
  }

  invalidateGang(gangId);

  return { ok: true };
}
