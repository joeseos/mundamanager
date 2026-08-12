import { allowsMultipleSubtypes, editionSlugFromJoin, gangEditionSlug } from '@/types/edition';
import { subtypeGrantsFromEffects } from '@/utils/effect-modifiers';
import type { TraitModificationData } from '@/types/fighter-effect';

/**
 * Equipment-granted fighter subtypes, e.g. a Dirt bike granting "Mounted".
 *
 * Subtypes are functional, not cosmetic — raw SQL reads fighters.fighter_subtypes
 * to pick skill cost tiers (get_available_skills) and the XP model
 * (get_fighter_available_advancements), and archetypes, promotion and roster
 * sorting all key off it. So a render-time merge like applySpecialRulesModifiers
 * would not reach them; the grant has to be written to the column.
 *
 * The effect row is the provenance. Every path that creates or destroys an
 * equipment effect already holds its type_specific_data for rating math, so
 * applying and reverting piggybacks on queries that already run.
 *
 * Lives here rather than in app/actions/equipment.ts because that file is
 * 'use server', where every export becomes a publicly callable endpoint; and
 * rather than in utils/effect-modifiers.ts, which imports nothing but types and
 * is pulled into five client components. The pure half of this feature — reading
 * the ids off type_specific_data — is in effect-modifiers.ts as
 * subtypeGrantsFromEffects, shared with the edit modal.
 */

/** Shape shared by effect types and effect instances — both carry type_specific_data. */
type EffectWithData = { type_specific_data?: TraitModificationData | string | null };

/**
 * Edition for a fighter, resolved server-side. The gang decides, because that is
 * the slug fighter-page.tsx hands the edit modal — resolving from the fighter
 * type instead would let the server reach a different verdict than the UI the
 * user just used. The fighter's own type is the fallback.
 *
 * Null means the edition never resolved, which reads as legacy N23 everywhere
 * else (see hasMasterCraftedWeapons in equipment.ts). Callers must treat it that
 * way rather than as an error: 34 custom_fighter_types and 9 custom_gang_types
 * still carry a null edition_id.
 */
export async function resolveFighterEditionSlug(
  supabase: any,
  fighterId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('fighters')
    .select(`
      fighter_types:fighter_type_id ( editions:edition_id ( slug ) ),
      custom_fighter_types:custom_fighter_type_id ( editions:edition_id ( slug ) ),
      gangs!gang_id (
        gang_types!gang_type_id ( editions:edition_id ( slug ) ),
        custom_gang_types!custom_gang_type_id ( editions:edition_id ( slug ) )
      )
    `)
    .eq('id', fighterId)
    .single();

  if (error || !data) return null;

  return (
    gangEditionSlug(data.gangs) ??
    editionSlugFromJoin(data.fighter_types?.editions) ??
    editionSlugFromJoin(data.custom_fighter_types?.editions)
  );
}

/**
 * Apply or revert subtype grants on fighters.fighter_subtypes.
 *
 * `granted` are effects that now exist on the fighter, `revoked` are effects that
 * no longer do. Callers pass whichever applies; both are optional.
 *
 * Call revoked AFTER the effect rows are gone. Delete and sell get that for free
 * from the fighter_equipment cascade, but move-to-stash reads its effects before
 * deleting them, so it must call this afterwards.
 */
export async function syncSubtypeGrants(
  supabase: any,
  fighterId: string | null | undefined,
  effects: { granted?: EffectWithData[] | null; revoked?: EffectWithData[] | null }
): Promise<void> {
  if (!fighterId) return;

  const granted = subtypeGrantsFromEffects(effects.granted);
  const revoked = subtypeGrantsFromEffects(effects.revoked);

  // The overwhelmingly common case: equipment that grants no subtype at all.
  // Bail before touching the database so ordinary purchases cost nothing.
  const touched = [...granted.add, ...granted.remove, ...revoked.add, ...revoked.remove];
  if (touched.length === 0) return;

  // A grant stacks a subtype on top of the fighter's own, so it only makes sense
  // where the edition allows several. allowsMultipleSubtypes(null) is false, so
  // an unresolved edition stays legacy rather than silently granting.
  const editionSlug = await resolveFighterEditionSlug(supabase, fighterId);
  if (!allowsMultipleSubtypes(editionSlug)) return;

  // Reverting a grant means undoing it, so the two directions cross over.
  const idsToAdd = new Set([...granted.add, ...revoked.remove]);
  const idsToRemove = new Set([...granted.remove, ...revoked.add]);

  // A subtype another item still grants must survive: selling one of two Dirt
  // bikes keeps Mounted. Only the revoked side can be contested, and the effect
  // rows are already gone by now, so what remains is what still counts.
  if (revoked.add.length > 0 || revoked.remove.length > 0) {
    const { data: remaining } = await supabase
      .from('fighter_effects')
      .select('type_specific_data')
      .eq('fighter_id', fighterId);

    const stillGranted = subtypeGrantsFromEffects(remaining);
    for (const id of stillGranted.add) idsToRemove.delete(id);
    for (const id of stillGranted.remove) idsToAdd.delete(id);
  }

  const { data: catalog } = await supabase
    .from('fighter_subtypes')
    .select('id, subtype_name')
    .in('id', [...idsToAdd, ...idsToRemove]);

  // An id with no catalog row resolves to nothing rather than a dangling name.
  const nameFor = new Map<string, string>(
    (catalog ?? []).map((row: { id: string; subtype_name: string }) => [row.id, row.subtype_name])
  );
  const namesToAdd = [...idsToAdd].map(id => nameFor.get(id)).filter((n): n is string => !!n);
  const namesToRemove = [...idsToRemove].map(id => nameFor.get(id)).filter((n): n is string => !!n);
  if (namesToAdd.length === 0 && namesToRemove.length === 0) return;

  const { data: fighter } = await supabase
    .from('fighters')
    .select('fighter_subtypes')
    .eq('id', fighterId)
    .single();
  if (!fighter) return;

  const current: string[] = Array.isArray(fighter.fighter_subtypes) ? fighter.fighter_subtypes : [];
  const removeSet = new Set(namesToRemove);
  const next = current.filter(name => !removeSet.has(name));
  for (const name of namesToAdd) {
    if (!next.includes(name)) next.push(name);
  }

  if (next.length === current.length && next.every((name, i) => name === current[i])) return;

  await supabase.from('fighters').update({ fighter_subtypes: next }).eq('id', fighterId);
}
