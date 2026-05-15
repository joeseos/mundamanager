import type { FighterEffect } from '@/types/fighter-effect';

/**
 * Must match `fighter_effect_types.effect_name` and lasting-injury tables (e.g. D66) for this injury.
 * Use everywhere we branch on this effect so renames stay in one place (DB migration must align).
 */
export const BITTER_ENMITY_EFFECT_NAME = 'Bitter Enmity' as const;

/**
 * Label used when aggregating injuries on gang card / print.
 * Matches {@link BITTER_ENMITY_EFFECT_NAME} plus enemy gang when stored — the granted
 * skill (e.g. Berserker) is shown separately on the fighter skills list.
 */
export function injuryAggregationLabel(injury: FighterEffect): string {
  const tsd =
    injury.type_specific_data && typeof injury.type_specific_data === 'object'
      ? (injury.type_specific_data as Record<string, unknown>)
      : null;
  const gangName =
    tsd && typeof tsd.bitter_enmity_target_gang_name === 'string'
      ? tsd.bitter_enmity_target_gang_name
      : '';

  if (injury.effect_name === BITTER_ENMITY_EFFECT_NAME && gangName) {
    return `${BITTER_ENMITY_EFFECT_NAME} (${gangName})`;
  }

  return injury.effect_name;
}
