/**
 * @module syncVenatorSkillOverrides
 *
 * *** SYNC-OWNS-TABLE INVARIANT — READ BEFORE MODIFYING ***
 *
 * `rewriteFighterOverrides` performs a full DELETE + INSERT cycle on
 * `fighter_skill_access_override` for the target fighter.  It does NOT merge
 * with pre-existing rows — it replaces them entirely.
 *
 * This is intentional: today, Venator fighter types (Leader / Champion /
 * Specialist) are not archetype-backed, so no other code path writes rows to
 * that table for those fighters.  The invariant holds because callers gate on
 * `gang_type === 'Venators'` before reaching this module.
 *
 * DANGER — future coupling risk:
 *   If any of these conditions change, the wipe becomes destructive:
 *     1. An archetype is wired to a Leader / Champion / Specialist subtype, AND
 *     2. That archetype writes rows to `fighter_skill_access_override`, AND
 *     3. The fighter's gang is a Venator gang (triggering a `syncFighter` call).
 *   In that scenario, every `syncFighter` call will silently erase the
 *   archetype-derived overrides for those fighters.
 *
 * If you are adding archetype-backed overrides for Venator subtypes, you MUST
 * either (a) change `rewriteFighterOverrides` to merge rather than wipe, or
 * (b) store archetype overrides in a separate table / column.
 */
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
