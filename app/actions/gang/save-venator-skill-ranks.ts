'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { syncGang } from '@/utils/syncVenatorSkillOverrides';
import { revalidateTag } from 'next/cache';
import { TAGS } from '@/utils/cache-tags';

interface SaveVenatorSkillRanksParams {
  gangId: string;
  ranks: Array<{ rank: number; skill_type_id: string }>;
}

export async function saveVenatorSkillRanks(
  params: SaveVenatorSkillRanksParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { gangId, ranks } = params;

  if (ranks.length !== 4) {
    return { ok: false, error: 'All four ranks must be set.' };
  }
  const rankValues = ranks.map((r) => r.rank).sort();
  if (rankValues.join(',') !== '1,2,3,4') {
    return { ok: false, error: 'Ranks must be exactly 1, 2, 3, 4.' };
  }
  const skillIds = ranks.map((r) => r.skill_type_id);
  if (new Set(skillIds).size !== 4) {
    return { ok: false, error: 'The same Skill Set cannot occupy two ranks.' };
  }

  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const { error: deleteErr } = await supabase
    .from('gang_skill_set_ranks')
    .delete()
    .eq('gang_id', gangId);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  const rows = ranks.map((r) => ({
    gang_id: gangId,
    rank: r.rank,
    skill_type_id: r.skill_type_id,
  }));
  const { error: insertErr } = await supabase
    .from('gang_skill_set_ranks')
    .insert(rows);
  if (insertErr) return { ok: false, error: insertErr.message };

  try {
    await syncGang(gangId, supabase, user.id);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to sync fighter overrides.',
    };
  }

  // Invalidate every affected fighter's skill-access cache tag by revalidating
  // the gang-level tag; individual fighter tags will refetch on next render.
  revalidateTag(TAGS.gang(gangId), { expire: 0 });

  return { ok: true };
}
