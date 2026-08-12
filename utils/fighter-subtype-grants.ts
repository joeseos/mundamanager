import { allowsMultipleSubtypes, editionSlugFromJoin, gangEditionSlug } from '@/types/edition';
import { subtypeGrantsFromEffects } from '@/utils/effect-modifiers';
import type { TraitModificationData } from '@/types/fighter-effect';

/**
 * Equipment-granted fighter subtypes, e.g. a Dirt bike granting "Mounted".
 *
 * Written to fighters.fighter_subtypes rather than merged at render like special
 * rules, because raw SQL reads that column for skill cost tiers and the XP model.
 * The effect row is the provenance, and every path that creates or destroys one
 * already holds its type_specific_data for rating math.
 */

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
 * `granted` are effects that now exist on the fighter, `revoked` are effects that
 * no longer do; callers pass whichever applies.
 *
 * Call revoked AFTER the effect rows are gone — delete and sell get that from the
 * fighter_equipment cascade, but move-to-stash deletes its own effects first.
 */
export async function syncSubtypeGrants(
  supabase: any,
  fighterId: string | null | undefined,
  effects: { granted?: EffectWithData[] | null; revoked?: EffectWithData[] | null }
): Promise<void> {
  // No vehicle branch needed: vehicle_id is N23-only, and N23 fails the edition
  // check below. On N26 a vehicle IS a fighter, so it arrives here as fighterId.
  if (!fighterId) return;

  const granted = subtypeGrantsFromEffects(effects.granted);
  const revoked = subtypeGrantsFromEffects(effects.revoked);

  // Ordinary purchases grant no subtype, so cost them nothing.
  const touched = [...granted.add, ...granted.remove, ...revoked.add, ...revoked.remove];
  if (touched.length === 0) return;

  // A grant stacks a subtype, so it needs an edition that allows several.
  // allowsMultipleSubtypes(null) is false, keeping an unresolved edition legacy.
  const editionSlug = await resolveFighterEditionSlug(supabase, fighterId);
  if (!allowsMultipleSubtypes(editionSlug)) return;

  // Reverting a grant means undoing it, so the two directions cross over.
  const idsToAdd = new Set([...granted.add, ...revoked.remove]);
  const idsToRemove = new Set([...granted.remove, ...revoked.add]);

  // Selling one of two Dirt bikes must keep Mounted. The revoked rows are already
  // gone by now, so whatever remains is what still counts.
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

  // Read-modify-write: two grant-bearing mutations racing on one fighter could
  // clobber each other. Atomicity would need a jsonb merge in SQL.
  await supabase.from('fighters').update({ fighter_subtypes: next }).eq('id', fighterId);
}
