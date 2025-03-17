import { FighterProps, FighterEffects, FighterEffect, FighterEffectStatModifier } from '@/types/fighter';

export function calculateAdjustedStats(fighter: FighterProps) {
  // Start with base stats
  const adjustedStats = {
    movement: fighter.movement,
    weapon_skill: fighter.weapon_skill,
    ballistic_skill: fighter.ballistic_skill,
    strength: fighter.strength,
    toughness: fighter.toughness,
    wounds: fighter.wounds,
    initiative: fighter.initiative,
    attacks: fighter.attacks,
    leadership: fighter.leadership,
    cool: fighter.cool,
    willpower: fighter.willpower,
    intelligence: fighter.intelligence
  };

  // Apply injury modifications first
  if (fighter.effects && fighter.effects.injuries && fighter.effects.injuries.length > 0) {
    fighter.effects.injuries.forEach((injury: FighterEffect) => {
      // Process all stat modifiers for this injury
      if (injury.fighter_effect_modifiers && injury.fighter_effect_modifiers.length > 0)
      injury.fighter_effect_modifiers.forEach((modifier: FighterEffectStatModifier) => {
        // Convert stat_name to the corresponding adjustedStats property
        switch (modifier.stat_name) {
          case 'Movement': adjustedStats.movement += modifier.numeric_value; break;
          case 'Weapon Skill': adjustedStats.weapon_skill += modifier.numeric_value; break;
          case 'Ballistic Skill': adjustedStats.ballistic_skill += modifier.numeric_value; break;
          case 'Strength': adjustedStats.strength += modifier.numeric_value; break;
          case 'Toughness': adjustedStats.toughness += modifier.numeric_value; break;
          case 'Wounds': adjustedStats.wounds += modifier.numeric_value; break;
          case 'Initiative': adjustedStats.initiative += modifier.numeric_value; break;
          case 'Attacks': adjustedStats.attacks += modifier.numeric_value; break;
          case 'Leadership': adjustedStats.leadership += modifier.numeric_value; break;
          case 'Cool': adjustedStats.cool += modifier.numeric_value; break;
          case 'Willpower': adjustedStats.willpower += modifier.numeric_value; break;
          case 'Intelligence': adjustedStats.intelligence += modifier.numeric_value; break;
        }
      });
    });
  }

  // Apply advancements after injuries
  if (fighter.advancements?.characteristics) {
    const statNameMapping: { [key: string]: keyof typeof adjustedStats } = {
      'Ballistic Skill': 'ballistic_skill',
      'Weapon Skill': 'weapon_skill',
      'Strength': 'strength',
      'Toughness': 'toughness',
      'Wounds': 'wounds',
      'Initiative': 'initiative',
      'Attacks': 'attacks',
      'Leadership': 'leadership',
      'Cool': 'cool',
      'Willpower': 'willpower',
      'Intelligence': 'intelligence',
      'Movement': 'movement'
    };

    Object.entries(fighter.advancements.characteristics).forEach(([statName, advancement]) => {
      const statProperty = statNameMapping[statName];
      if (statProperty) {
        adjustedStats[statProperty] += advancement.characteristic_value;
      }
    });
  }

  return adjustedStats;
} 