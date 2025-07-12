import { FighterProps, FighterEffect, EffectCategory } from '@/types/fighter';

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
    intelligence: fighter.intelligence,
  };

  if (fighter.effects) {
    const processEffects = (effects: FighterEffect[]) => {
      effects?.forEach((effect) => {
        if (effect.fighter_effect_modifiers?.length > 0) {
          effect.fighter_effect_modifiers.forEach((modifier) => {
            const statName = modifier.stat_name.toLowerCase();
            const value = modifier.numeric_value;

            const statMapping: Record<string, keyof typeof adjustedStats> = {
              movement: 'movement',
              weapon_skill: 'weapon_skill',
              ballistic_skill: 'ballistic_skill',
              strength: 'strength',
              toughness: 'toughness',
              wounds: 'wounds',
              initiative: 'initiative',
              attacks: 'attacks',
              leadership: 'leadership',
              cool: 'cool',
              willpower: 'willpower',
              intelligence: 'intelligence',
            };

            const statKey = statMapping[statName];
            if (statKey) {
              adjustedStats[statKey] += value;
            }
          });
        }
      });
    };

    // Process all effect types
    const effectCategories: EffectCategory[] = [
      'injuries',
      'advancements',
      'bionics',
      'cyberteknika',
      'gene-smithing',
      'rig-glitches',
      'augmentations',
      'equipment',
      'user',
    ];

    effectCategories.forEach((category) => {
      if (Array.isArray(fighter.effects[category])) {
        processEffects(fighter.effects[category] || []);
      }
    });
  }

  // Apply old-style advancements if present (for backward compatibility)
  if (fighter.advancements?.characteristics) {
    const statNameMapping: { [key: string]: keyof typeof adjustedStats } = {
      'Ballistic Skill': 'ballistic_skill',
      'Weapon Skill': 'weapon_skill',
      Strength: 'strength',
      Toughness: 'toughness',
      Wounds: 'wounds',
      Initiative: 'initiative',
      Attacks: 'attacks',
      Leadership: 'leadership',
      Cool: 'cool',
      Willpower: 'willpower',
      Intelligence: 'intelligence',
      Movement: 'movement',
    };

    Object.entries(fighter.advancements.characteristics).forEach(
      ([statName, advancement]) => {
        const statProperty = statNameMapping[statName];
        if (statProperty) {
          adjustedStats[statProperty] += advancement.characteristic_value;
        }
      }
    );
  }

  return adjustedStats;
}
