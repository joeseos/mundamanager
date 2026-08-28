import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveOverrides } from '@/utils/venatorSkillAccess';

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
  overrides: Array<{ skill_type_id: string; access_level: 'primary' | 'secondary' }>,
): Promise<void> {
  const { error: deleteErr } = await supabase
    .from('fighter_skill_access_override')
    .delete()
    .eq('fighter_id', fighterId);
  if (deleteErr) throw deleteErr;

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

export async function syncFighter(
  fighterId: string,
  supabase: SupabaseClient,
  actingUserId: string,
): Promise<void> {
  const { data: fighter, error: fighterErr } = await supabase
    .from('fighters')
    .select('gang_id, fighter_subtypes')
    .eq('id', fighterId)
    .single();
  if (fighterErr) throw fighterErr;

  const ranks = await readGangRanks(fighter.gang_id, supabase);
  if (ranks.length === 0) return;

  const subtypes: string[] = Array.isArray(fighter.fighter_subtypes) ? fighter.fighter_subtypes : [];
  const overrides = deriveOverrides(ranks, subtypes);

  await rewriteFighterOverrides(fighterId, supabase, actingUserId, overrides);
}

export async function syncGang(
  gangId: string,
  supabase: SupabaseClient,
  actingUserId: string,
): Promise<void> {
  const ranks = await readGangRanks(gangId, supabase);
  if (ranks.length === 0) return;

  const { data: fighters, error: fightersErr } = await supabase
    .from('fighters')
    .select('id, fighter_subtypes')
    .eq('gang_id', gangId);
  if (fightersErr) throw fightersErr;

  const targets = (fighters ?? []).map((f) => {
    const subs: string[] = Array.isArray(f.fighter_subtypes) ? f.fighter_subtypes : [];
    return { id: f.id as string, overrides: deriveOverrides(ranks, subs) };
  });

  if (targets.length === 0) return;

  const targetIds = targets.map((t) => t.id);
  const { error: deleteErr } = await supabase
    .from('fighter_skill_access_override')
    .delete()
    .in('fighter_id', targetIds);
  if (deleteErr) throw deleteErr;

  const rows = targets
    .filter((t) => t.overrides.length > 0)
    .flatMap((t) =>
      t.overrides.map((o) => ({
        fighter_id: t.id,
        skill_type_id: o.skill_type_id,
        access_level: o.access_level,
        user_id: actingUserId,
      })),
    );

  if (rows.length === 0) return;

  const { error: insertErr } = await supabase
    .from('fighter_skill_access_override')
    .insert(rows);
  if (insertErr) throw insertErr;
}
