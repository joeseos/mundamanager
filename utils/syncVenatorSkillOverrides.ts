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

export interface SyncFighterInput {
  fighterId: string;
  gangId: string;
  gangType: string | null | undefined;
  editionSlug: string | null | undefined;
  isCustomGangType: boolean;
  subtypes: readonly string[];
}

export async function syncFighter(
  input: SyncFighterInput,
  supabase: SupabaseClient,
): Promise<void> {
  if (!isVenatorGang(input.editionSlug, input.gangType, input.isCustomGangType)) return;

  const ranks = await readGangRanks(input.gangId, supabase);
  if (ranks.length === 0) return;

  const overrides = deriveOverrides(ranks, input.subtypes);
  const ownedSkillTypeIds = ranks.map((r) => r.skill_type_id);

  const { error } = await supabase.rpc('replace_fighter_skill_access_overrides', {
    p_fighter_id: input.fighterId,
    p_owned_skill_type_ids: ownedSkillTypeIds.length > 0 ? ownedSkillTypeIds : null,
    p_overrides: overrides.map((o) => ({
      skill_type_id: o.skill_type_id,
      access_level: o.access_level,
    })),
  });
  if (error) throw error;
}

export async function replaceGangRanks(
  gangId: string,
  ranks: Array<{ rank: number; skill_type_id: string }>,
  gangType: string | null | undefined,
  editionSlug: string | null | undefined,
  isCustomGangType: boolean,
  supabase: SupabaseClient,
): Promise<void> {
  if (!isVenatorGang(editionSlug, gangType, isCustomGangType)) return;

  const { data: previousRanks, error: previousRanksErr } = await supabase
    .from('gang_skill_set_ranks')
    .select('skill_type_id')
    .eq('gang_id', gangId);
  if (previousRanksErr) throw previousRanksErr;

  const currentSkillTypeIds = ranks.map((r) => r.skill_type_id);
  const ownedSkillTypeIds = Array.from(
    new Set<string>([
      ...(previousRanks ?? []).map((r) => r.skill_type_id as string),
      ...currentSkillTypeIds,
    ]),
  );

  const { data: fighters, error: fightersErr } = await supabase
    .from('fighters')
    .select('id, fighter_subtypes')
    .eq('gang_id', gangId);
  if (fightersErr) throw fightersErr;

  const overrides = (fighters ?? []).flatMap((f) => {
    const subs: string[] = Array.isArray(f.fighter_subtypes) ? f.fighter_subtypes : [];
    return deriveOverrides(ranks, subs).map((o) => ({
      fighter_id: f.id as string,
      skill_type_id: o.skill_type_id,
      access_level: o.access_level,
    }));
  });

  const { error } = await supabase.rpc('replace_gang_skill_set_ranks', {
    p_gang_id: gangId,
    p_ranks: ranks,
    p_owned_skill_type_ids: ownedSkillTypeIds.length > 0 ? ownedSkillTypeIds : null,
    p_overrides: overrides,
  });
  if (error) throw error;
}
