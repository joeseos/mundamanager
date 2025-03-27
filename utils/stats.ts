import { FighterProps, FighterEffect } from '@/types/fighter';

// Fix the FighterEffectStatModifier by defining it directly
interface FighterEffectStatModifier {
  id: string;
  fighter_effect_id: string;
  stat_name: string;
  numeric_value: number;
}

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

  // Apply effects modifications (both injuries and advancements)
  if (fighter.effects) {
    // Process injuries
    if (fighter.effects.injuries && fighter.effects.injuries.length > 0) {
      fighter.effects.injuries.forEach((injury: FighterEffect) => {
        // Process all stat modifiers for this injury
        if (injury.fighter_effect_modifiers && injury.fighter_effect_modifiers.length > 0) {
          injury.fighter_effect_modifiers.forEach((modifier: FighterEffectStatModifier) => {
            // Handle case sensitivity in stat names
            const statName = modifier.stat_name.toLowerCase();
            
            // Map the stat name to the right property name
            const statMapping: Record<string, keyof typeof adjustedStats> = {
              'movement': 'movement',
              'weapon_skill': 'weapon_skill',
              'ballistic_skill': 'ballistic_skill',
              'strength': 'strength',
              'toughness': 'toughness',
              'wounds': 'wounds',
              'initiative': 'initiative',
              'attacks': 'attacks',
              'leadership': 'leadership',
              'cool': 'cool',
              'willpower': 'willpower',
              'intelligence': 'intelligence'
            };
            
            // Apply the modifier
            const statKey = statMapping[statName];
            if (statKey) {
              adjustedStats[statKey] += modifier.numeric_value;
            }
          });
        }
      });
    }

    // Process advancements if available
    if (fighter.effects.advancements && fighter.effects.advancements.length > 0) {
      // Similar logic for advancements
      fighter.effects.advancements.forEach((advancement: FighterEffect) => {
        if (advancement.fighter_effect_modifiers && advancement.fighter_effect_modifiers.length > 0) {
          advancement.fighter_effect_modifiers.forEach((modifier: FighterEffectStatModifier) => {
            const statName = modifier.stat_name.toLowerCase();
            const statMapping: Record<string, keyof typeof adjustedStats> = {
              'movement': 'movement',
              'weapon_skill': 'weapon_skill',
              'ballistic_skill': 'ballistic_skill',
              'strength': 'strength',
              'toughness': 'toughness',
              'wounds': 'wounds',
              'initiative': 'initiative',
              'attacks': 'attacks',
              'leadership': 'leadership',
              'cool': 'cool',
              'willpower': 'willpower',
              'intelligence': 'intelligence'
            };
            
            const statKey = statMapping[statName];
            if (statKey) {
              adjustedStats[statKey] += modifier.numeric_value;
            }
          });
        }
      });
    }
  }

  // Apply old-style advancements if present (for backward compatibility)
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