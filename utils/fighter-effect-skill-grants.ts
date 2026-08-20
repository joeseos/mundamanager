import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import type { TypeSpecificData } from '@/types/fighter-effect';

/**
 * Effect-granted skills, e.g. a bionic arm granting "Iron Jaw".
 *
 * Same shape as the injury grant in add_fighter_injury.sql: a fighter_skills row
 * owned by the effect through fighter_effect_skills. Removal needs no code — the
 * fighter_equipment -> fighter_effects -> fighter_effect_skills -> fighter_skills
 * chain is ON DELETE CASCADE throughout.
 */

type EffectWithData = {
  type_specific_data?: TypeSpecificData | Record<string, any> | string | null;
};

type GrantingEffect = EffectWithData & {
  id: string;
  fighter_effect_type_id: string;
};

function skillIdOf(effect: EffectWithData): string | null {
  const data = effect.type_specific_data;
  if (!data || typeof data !== 'object') return null;
  const skillId = (data as Record<string, unknown>).skill_id;
  return typeof skillId === 'string' && skillId ? skillId : null;
}

/**
 * Returns whether anything was granted, so callers can revalidate
 * CACHE_TAGS.BASE_FIGHTER_SKILLS.
 */
export async function grantSkillsForEffects(
  supabase: any,
  fighterId: string | null | undefined,
  effects: GrantingEffect[] | null | undefined,
  userId: string
): Promise<boolean> {
  // Skills are fighter-scoped, so an N23 vehicle-only effect grants nothing. On
  // N26 a vehicle is a fighter and arrives here as fighterId.
  if (!fighterId) return false;

  const candidates = (effects ?? []).filter(effect => skillIdOf(effect) !== null);
  if (candidates.length === 0) return false;

  // skill_id on a 'skills'-category type means the skill this effect BELONGS TO
  // (fighter-advancement.ts), not one it grants. addEquipmentEffect takes an
  // effect_type_id from the client, so this decides a real request, not a
  // hypothetical one.
  const { data: types } = await supabase
    .from('fighter_effect_types')
    .select('id, fighter_effect_categories ( category_name )')
    .in('id', candidates.map(effect => effect.fighter_effect_type_id));

  const skillCategoryTypeIds = new Set(
    (types ?? [])
      .filter((row: any) => row.fighter_effect_categories?.category_name === 'skills')
      .map((row: any) => row.id)
  );

  let granted = false;

  for (const effect of candidates) {
    if (skillCategoryTypeIds.has(effect.fighter_effect_type_id)) continue;

    // Zero cost: the equipment's price and the effect's own credits_increase
    // already drive rating.
    const { data: skill, error: skillError } = await supabase
      .from('fighter_skills')
      .insert({
        fighter_id: fighterId,
        skill_id: skillIdOf(effect),
        user_id: userId,
        credits_increase: 0,
        xp_cost: 0,
        is_advance: false
      })
      .select('id')
      .single();

    if (!skill) {
      console.error('Failed to insert granted skill:', skillError);
      continue;
    }

    const { data: link, error: linkError } = await supabase
      .from('fighter_effect_skills')
      .insert({ fighter_effect_id: effect.id, fighter_skill_id: skill.id })
      .select('id')
      .single();

    // Without the link the skill has no provenance and no cascade, so it goes.
    if (!link) {
      console.error('Failed to link granted skill to effect:', linkError);
      await supabase.from('fighter_skills').delete().eq('id', skill.id);
      continue;
    }

    await supabase
      .from('fighter_skills')
      .update({ fighter_effect_skill_id: link.id })
      .eq('id', skill.id);

    granted = true;
  }

  return granted;
}

type MappedSkill = { fighter_injury_id?: string | null; acquired_at?: string | null };

/**
 * The skills map is keyed by skill name, so two rows for one skill collide.
 * An effect grant never displaces a skill the fighter bought, otherwise the
 * older row wins.
 */
export function skillRowSupersedes(incoming: MappedSkill, existing: MappedSkill | undefined): boolean {
  if (!existing) return true;

  const incomingGranted = !!incoming.fighter_injury_id;
  const existingGranted = !!existing.fighter_injury_id;
  if (incomingGranted !== existingGranted) return existingGranted;

  return (incoming.acquired_at ?? '') < (existing.acquired_at ?? '');
}

/**
 * Call after the effect rows are gone. The skill rows went with them via the
 * cascade, so only the cache needs telling.
 */
export function revalidateRevokedSkillGrants(
  fighterId: string | null | undefined,
  effects: EffectWithData[] | null | undefined
): void {
  if (!fighterId) return;
  if (!(effects ?? []).some(effect => skillIdOf(effect) !== null)) return;

  revalidateTag(CACHE_TAGS.BASE_FIGHTER_SKILLS(fighterId), { expire: 0 });
}
