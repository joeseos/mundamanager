import { FighterProps, Injury } from '@/types/fighter';

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
  if (fighter.injuries && fighter.injuries.length > 0) {
    fighter.injuries.forEach((injury: Injury) => {
      // Handle first characteristic
      if (injury.code_1 && injury.characteristic_1) {
        switch (injury.code_1) {
          case 'M': adjustedStats.movement += injury.characteristic_1; break;
          case 'WS': adjustedStats.weapon_skill += injury.characteristic_1; break;
          case 'BS': adjustedStats.ballistic_skill += injury.characteristic_1; break;
          case 'S': adjustedStats.strength += injury.characteristic_1; break;
          case 'T': adjustedStats.toughness += injury.characteristic_1; break;
          case 'W': adjustedStats.wounds += injury.characteristic_1; break;
          case 'I': adjustedStats.initiative += injury.characteristic_1; break;
          case 'A': adjustedStats.attacks += injury.characteristic_1; break;
          case 'Ld': adjustedStats.leadership += injury.characteristic_1; break;
          case 'Cl': adjustedStats.cool += injury.characteristic_1; break;
          case 'Wil': adjustedStats.willpower += injury.characteristic_1; break;
          case 'Int': adjustedStats.intelligence += injury.characteristic_1; break;
        }
      }
      
      // Handle second characteristic
      if (injury.code_2 && injury.characteristic_2) {
        switch (injury.code_2) {
          case 'M': adjustedStats.movement += injury.characteristic_2; break;
          case 'WS': adjustedStats.weapon_skill += injury.characteristic_2; break;
          case 'BS': adjustedStats.ballistic_skill += injury.characteristic_2; break;
          case 'S': adjustedStats.strength += injury.characteristic_2; break;
          case 'T': adjustedStats.toughness += injury.characteristic_2; break;
          case 'W': adjustedStats.wounds += injury.characteristic_2; break;
          case 'I': adjustedStats.initiative += injury.characteristic_2; break;
          case 'A': adjustedStats.attacks += injury.characteristic_2; break;
          case 'Ld': adjustedStats.leadership += injury.characteristic_2; break;
          case 'Cl': adjustedStats.cool += injury.characteristic_2; break;
          case 'Wil': adjustedStats.willpower += injury.characteristic_2; break;
          case 'Int': adjustedStats.intelligence += injury.characteristic_2; break;
        }
      }
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