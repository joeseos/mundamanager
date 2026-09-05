import { getGangFightersBundle } from '@/app/lib/shared/gang-data';
import { countAdvancementsTaken } from '@/utils/advancementRanks';

/**
 * Get gang fighters (id/name/status columns) — selector over the shared
 * gang fighters bundle, so it reads the same cache entry as the gang page
 * instead of maintaining a duplicate copy of the gang's fighter list.
 *
 * Also carries starting_xp and advancements_taken so the fighter-page
 * Combobox can derive open Advancements without a second fetch.
 */
export const getGangFighters = async (gangId: string, supabase: any) => {
  const bundle = await getGangFightersBundle(gangId, supabase);

  const advancementEffectsByFighter = new Map<string, unknown[]>();
  for (const effect of bundle.effects) {
    if (!effect.fighter_id) continue;
    const category =
      effect.fighter_effect_type?.fighter_effect_category?.category_name;
    if (category !== 'advancements') continue;

    const list = advancementEffectsByFighter.get(effect.fighter_id);
    if (list) {
      list.push(effect);
    } else {
      advancementEffectsByFighter.set(effect.fighter_id, [effect]);
    }
  }

  const skillsByFighter = new Map<string, Record<string, { is_advance?: boolean }>>();
  for (const skill of bundle.skills) {
    if (!skill.fighter_id) continue;
    const key = skill.id ?? `${skill.fighter_id}-${skill.created_at}`;
    const existing = skillsByFighter.get(skill.fighter_id) ?? {};
    existing[key] = { is_advance: skill.is_advance || false };
    skillsByFighter.set(skill.fighter_id, existing);
  }

  return bundle.fighters.map((f: any) => ({
    id: f.id,
    fighter_name: f.fighter_name,
    fighter_type: f.fighter_type,
    fighter_subtypes: Array.isArray(f.fighter_subtypes) ? f.fighter_subtypes : [],
    fighter_type_subtypes: Array.isArray(f.fighter_types?.fighter_subtypes)
      ? f.fighter_types.fighter_subtypes
      : [],
    xp: f.xp,
    starting_xp: f.starting_xp ?? null,
    advancements_taken: countAdvancementsTaken(
      { advancements: advancementEffectsByFighter.get(f.id) ?? [] },
      skillsByFighter.get(f.id) ?? {},
    ),
    killed: f.killed,
    retired: f.retired,
    enslaved: f.enslaved,
    starved: f.starved,
    recovery: f.recovery,
    captured: f.captured,
  }));
};
