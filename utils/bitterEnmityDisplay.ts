import type { FighterEffect } from '@/types/fighter-effect';

/** Label used when aggregating injuries on gang card / print (Bitter Enmity with chosen enemy gang). */
export function injuryAggregationLabel(injury: FighterEffect): string {
  const tsd =
    injury.type_specific_data && typeof injury.type_specific_data === 'object'
      ? (injury.type_specific_data as Record<string, unknown>)
      : null;
  const gangName =
    tsd && typeof tsd.bitter_enmity_target_gang_name === 'string'
      ? tsd.bitter_enmity_target_gang_name
      : '';

  if (injury.effect_name === 'Bitter Enmity' && gangName) {
    return `Berserker (${gangName})`;
  }

  return injury.effect_name;
}
