/**
 * Consolidated effect modifier utilities
 * Handles both fighter stat effects and weapon profile effects
 * Uses the same database tables: fighter_effects + fighter_effect_modifiers
 */

import { FighterProps, FighterEffect, EffectCategory } from '@/types/fighter';
import { WeaponProfile } from '@/types/equipment';
import { TraitModificationData } from '@/types/fighter-effect';

// =============================================================================
// SHARED TYPES
// =============================================================================

interface EffectModifier {
  stat_name: string;
  numeric_value: number;
  operation?: 'add' | 'set';  // DEFAULTS TO 'add' if missing
}

interface Effect {
  id: string;
  effect_name: string;
  type_specific_data?: TraitModificationData;
  fighter_effect_modifiers?: EffectModifier[];
}

// =============================================================================
// CORE SHARED LOGIC
// =============================================================================

/**
 * Core function to apply numeric modifiers with add/set operations
 * SAFE: Defaults to 'add' operation for backward compatibility
 *
 * Design: Parse → Accumulate → Apply → Format (single pass, no early returns)
 * Handles unparseable values ("-", "N/A", null) gracefully via null semantics
 */
function applyNumericModifiers(
  baseValue: number | string,
  modifiers: EffectModifier[],
  options: {
    parseStrings?: boolean;  // true for weapons (can be "6+"), false for fighter stats
    addSuffix?: string;      // '+' for ammo field
  } = {}
): number | string {
  // =============================================
  // STEP 1: Parse base value (with safe defaults)
  // =============================================
  let parsedBase: number | null = null;

  if (typeof baseValue === 'number') {
    parsedBase = baseValue;
  } else if (typeof baseValue === 'string' && options.parseStrings) {
    // Remove common formatting characters
    const cleaned = baseValue.replace(/[+\-\s]/g, '').trim();

    if (cleaned === '' || cleaned === 'N/A') {
      // Unparseable values like "-", "N/A", etc.
      parsedBase = null;  // Will be overridden by SET or default to base
    } else {
      const parsed = parseInt(cleaned, 10);
      parsedBase = Number.isFinite(parsed) ? parsed : null;
    }
  } else if (typeof baseValue === 'string') {
    // Fighter stats: strings are not expected
    return baseValue;
  }

  // =============================================
  // STEP 2: Accumulate modifiers (single pass)
  // =============================================
  let additionSum = 0;
  let finalSetValue: number | null = null;

  modifiers.forEach(m => {
    const operation = m.operation || 'add';  // DEFAULT TO 'add' FOR SAFETY
    const value = Number(m.numeric_value);

    if (!Number.isFinite(value)) return;

    if (operation === 'add') {
      additionSum += value;
    } else if (operation === 'set') {
      finalSetValue = value;  // Last SET wins
    }
  });

  // =============================================
  // STEP 3: Apply operations (clear precedence)
  // =============================================
  let result: number;

  if (finalSetValue !== null) {
    // SET operation: completely overrides base value
    result = finalSetValue;
  } else if (parsedBase !== null) {
    // ADD operation: add to parsed base
    result = parsedBase + additionSum;
  } else if (additionSum !== 0) {
    // Edge case: unparseable base + additions
    // Treat unparseable as 0 for additions
    result = additionSum;
  } else {
    // Nothing to do, return original
    return baseValue;
  }

  // =============================================
  // STEP 4: Format output (context-aware)
  // =============================================
  if (options.addSuffix) {
    return `${result}${options.addSuffix}`;
  }

  return result;
}

// =============================================================================
// FIGHTER STAT EFFECTS
// =============================================================================

/**
 * Calculate fighter stats with all effects applied
 * Processes all effect categories: injuries, equipment, advancements, etc.
 * SAFE: Defaults to 'add' operation for backward compatibility
 */
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

  if (fighter.effects) {
    const processEffects = (effects: FighterEffect[]) => {
      effects?.forEach(effect => {
        if (effect.fighter_effect_modifiers?.length > 0) {
          effect.fighter_effect_modifiers.forEach(modifier => {
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
              // Use shared logic: numbers only, no string parsing
              const baseValue = adjustedStats[statKey];
              const result = applyNumericModifiers(baseValue, [modifier], { parseStrings: false });
              adjustedStats[statKey] = result as number;
            }
          });
        }
      });
    };

    // Process all effect types
    const effectCategories: EffectCategory[] = ['injuries', 'advancements', 'bionics', 'cyberteknika', 'gene-smithing', 'rig-glitches', 'power-boosts', 'augmentations', 'equipment', 'user', 'skills'];

    effectCategories.forEach(category => {
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

// =============================================================================
// WEAPON PROFILE EFFECTS
// =============================================================================

/**
 * Apply equipment→equipment effect modifiers to weapon profiles
 * Handles numeric fields (strength, ap, damage, ammo) and traits
 * SAFE: Defaults to 'add' operation for backward compatibility
 */
export function applyWeaponModifiers(
  profiles: WeaponProfile[],
  effects: Effect[]
): WeaponProfile[] {
  if (!effects || effects.length === 0 || !profiles || profiles.length === 0) {
    return profiles;
  }

  return profiles.map((profile) => {
    // Work on a copy
    const modified = { ...profile };

    // Apply numeric fields with add/set operations
    const numericFields = ['range_short', 'range_long', 'acc_short', 'acc_long', 'strength', 'ap', 'damage', 'ammo'];

    numericFields.forEach((fieldName) => {
      const baseValue = (modified as any)[fieldName];
      if (baseValue === null || baseValue === undefined) return;

      // Collect all modifiers for this field
      const fieldModifiers: EffectModifier[] = [];
      effects.forEach(eff => {
        (eff.fighter_effect_modifiers || []).forEach(m => {
          if (m.stat_name === fieldName) {
            fieldModifiers.push(m);
          }
        });
      });

      if (fieldModifiers.length > 0) {
        // Apply modifiers using shared logic
        const result = applyNumericModifiers(baseValue, fieldModifiers, {
          parseStrings: true,
          addSuffix: fieldName === 'ammo' ? '+' : undefined
        });
        (modified as any)[fieldName] = result;
      }
    });

    // Traits add/remove via type_specific_data (weapon-specific feature)
    let traitsArr: string[] = (modified.traits || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);

    effects.forEach((eff) => {
      const tsd = eff.type_specific_data || {};
      const toRemove: string[] = tsd.traits_to_remove || [];
      const toAdd: string[] = tsd.traits_to_add || [];

      if (toRemove.length > 0) {
        traitsArr = traitsArr.filter(t => !toRemove.includes(t));
      }
      if (toAdd.length > 0) {
        for (const t of toAdd) {
          if (!traitsArr.includes(t)) traitsArr.push(t);
        }
      }
    });
    modified.traits = traitsArr.join(', ');

    return modified;
  });
}
