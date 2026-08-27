import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveOverrides } from '@/utils/venatorSkillAccess';

const VENATOR_SUBTYPES = ['Leader', 'Champion', 'Specialist'] as const;

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

/**
 * Recompute a single fighter's Venator overrides from their gang's current
 * ranks. Wipes and rewrites the fighter's rows in fighter_skill_access_override.
 * Callers must gate on gang type + edition; this function is unconditional
 * on those axes.
 */
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
  const subtypes: string[] = Array.isArray(fighter.fighter_subtypes) ? fighter.fighter_subtypes : [];

  const overrides = deriveOverrides(ranks, subtypes);
  await rewriteFighterOverrides(fighterId, supabase, actingUserId, overrides);
}

/**
 * Recompute overrides for every fighter in the gang whose subtypes include a
 * Venator subtype. Used when the gang's ranks change.
 */
export async function syncGang(
  gangId: string,
  supabase: SupabaseClient,
  actingUserId: string,
): Promise<void> {
  const ranks = await readGangRanks(gangId, supabase);

  const { data: fighters, error: fightersErr } = await supabase
    .from('fighters')
    .select('id, fighter_subtypes')
    .eq('gang_id', gangId);
  if (fightersErr) throw fightersErr;

  const targets = (fighters ?? []).filter((f) => {
    const subs: string[] = Array.isArray(f.fighter_subtypes) ? f.fighter_subtypes : [];
    return subs.some((s) => (VENATOR_SUBTYPES as readonly string[]).includes(s));
  });

  for (const f of targets) {
    const subs: string[] = Array.isArray(f.fighter_subtypes) ? f.fighter_subtypes : [];
    const overrides = deriveOverrides(ranks, subs);
    await rewriteFighterOverrides(f.id, supabase, actingUserId, overrides);
  }
}
