import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveOverrides, isVenatorGang } from '@/utils/venatorSkillAccess';

async function readGangRanks(gangId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('gang_skill_set_ranks')
    .select('rank, skill_type_id')
    .eq('gang_id', gangId);
  if (error) throw error;
  return data ?? [];
}

async function rewriteFighterOverrides(
  fighterId: string,
  supabase: SupabaseClient,
  actingUserId: string,
  ownedSkillTypeIds: readonly string[],
  overrides: Array<{ skill_type_id: string; access_level: 'primary' | 'secondary' }>,
): Promise<void> {
  if (ownedSkillTypeIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from('fighter_skill_access_override')
      .delete()
      .eq('fighter_id', fighterId)
      .in('skill_type_id', ownedSkillTypeIds as string[]);
    if (deleteErr) throw deleteErr;
  }

  if (overrides.length === 0) return;

  const rows = overrides.map((o) => ({
    fighter_id: fighterId,
    skill_type_id: o.skill_type_id,
    access_level: o.access_level,
    user_id: actingUserId,
  }));

  const { error: insertErr } = await supabase
    .from('fighter_skill_access_override')
    .insert(rows);
  if (insertErr) throw insertErr;
}

export interface SyncFighterInput {
  fighterId: string;
  gangId: string;
  gangType: string | null | undefined;
  editionSlug: string | null | undefined;
  subtypes: readonly string[];
}

export async function syncFighter(
  input: SyncFighterInput,
  supabase: SupabaseClient,
  actingUserId: string,
): Promise<void> {
  if (!isVenatorGang(input.editionSlug, input.gangType)) return;

  const ranks = await readGangRanks(input.gangId, supabase);
  if (ranks.length === 0) return;

  const overrides = deriveOverrides(ranks, input.subtypes);
  const ownedSkillTypeIds = ranks.map((r) => r.skill_type_id);

  await rewriteFighterOverrides(input.fighterId, supabase, actingUserId, ownedSkillTypeIds, overrides);
}

export async function syncGang(
  gangId: string,
  gangType: string | null | undefined,
  editionSlug: string | null | undefined,
  supabase: SupabaseClient,
  actingUserId: string,
  previouslyOwnedSkillTypeIds: readonly string[] = [],
): Promise<void> {
  if (!isVenatorGang(editionSlug, gangType)) return;

  const ranks = await readGangRanks(gangId, supabase);
  const currentSkillTypeIds = ranks.map((r) => r.skill_type_id);
  const ownedSkillTypeIds = Array.from(
    new Set<string>([...previouslyOwnedSkillTypeIds, ...currentSkillTypeIds]),
  );

  const { data: fighters, error: fightersErr } = await supabase
    .from('fighters')
    .select('id, fighter_subtypes')
    .eq('gang_id', gangId);
  if (fightersErr) throw fightersErr;

  const targetIds = (fighters ?? []).map((f) => f.id as string);
  if (targetIds.length === 0 || ownedSkillTypeIds.length === 0) return;

  const { error: deleteErr } = await supabase
    .from('fighter_skill_access_override')
    .delete()
    .in('fighter_id', targetIds)
    .in('skill_type_id', ownedSkillTypeIds);
  if (deleteErr) throw deleteErr;

  if (ranks.length === 0) return;

  const rows = (fighters ?? [])
    .flatMap((f) => {
      const subs: string[] = Array.isArray(f.fighter_subtypes) ? f.fighter_subtypes : [];
      return deriveOverrides(ranks, subs).map((o) => ({
        fighter_id: f.id as string,
        skill_type_id: o.skill_type_id,
        access_level: o.access_level,
        user_id: actingUserId,
      }));
    });

  if (rows.length === 0) return;

  const { error: insertErr } = await supabase
    .from('fighter_skill_access_override')
    .insert(rows);
  if (insertErr) throw insertErr;
}
