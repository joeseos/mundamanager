import { FighterProps } from '@/types/fighter';

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

  if (!fighter.advancements?.characteristics) {
    return adjustedStats;
  }

  // Map of stat names to their property names in adjustedStats
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

  // Apply each advancement
  Object.entries(fighter.advancements.characteristics).forEach(([statName, advancement]) => {
    const statProperty = statNameMapping[statName];
    if (statProperty) {
      adjustedStats[statProperty] += advancement.characteristic_value;
    }
  });

  return adjustedStats;
} 