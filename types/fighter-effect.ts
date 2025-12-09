/**
 * Centralized type definitions for fighter effects
 * Single source of truth for all fighter effect types in the application.
 */

// =============================================================================
// TYPE_SPECIFIC_DATA
// =============================================================================

/** Trait modifications (subset exported for effect-modifiers.ts) */
export interface TraitModificationData {
  traits_to_add?: string[];
  traits_to_remove?: string[];
}

/** Comprehensive type_specific_data for all effect types */
export interface TypeSpecificData extends TraitModificationData {
  // Base fields
  equipment_id?: string;
  skill_id?: string;
  // Selection behavior
  applies_to?: 'equipment';
  effect_selection?: 'fixed' | 'single_select' | 'multiple_select';
  max_selections?: number;
  selection_group?: string;
  // Injury/Rig-glitch fields
  recovery?: 'true' | 'false' | string | boolean;
  convalescence?: 'true' | 'false' | string | boolean;
  captured?: 'true' | 'false' | string;
  d66_min?: number;  // Dice roll range for injury tables
  d66_max?: number;
  // Advancement fields
  xp_cost?: number;
  credits_increase?: number;
  advancement_type?: string;
  times_increased?: number;
  // Power boost fields
  kill_cost?: number;
  // Index signature for legacy/unknown database fields
  [key: string]: string | number | boolean | string[] | undefined;
}

// =============================================================================
// EFFECT CATEGORIES
// =============================================================================

export type EffectCategoryName = 
  | 'injuries' | 'advancements' | 'bionics' | 'cyberteknika' | 'gene-smithing'
  | 'rig-glitches' | 'augmentations' | 'equipment' | 'user' | 'skills' | 'power-boosts';

export interface FighterEffectCategory {
  id: string;
  category_name: string;
  created_at?: string;
  updated_at?: string | null;
}

// =============================================================================
// EFFECT TYPE (template from fighter_effect_types table)
// =============================================================================

/** Modifier for effect type template - uses default_numeric_value */
export interface FighterEffectTypeModifier {
  id?: string;
  fighter_effect_type_id?: string;
  stat_name: string;
  default_numeric_value: number | null;
  operation?: 'add' | 'set';
}

/** Effect type template/definition */
export interface FighterEffectType {
  id: string;
  effect_name: string;
  fighter_effect_category_id: string | null;
  type_specific_data: TypeSpecificData | null;
  modifiers: FighterEffectTypeModifier[];
  fighter_effect_categories?: FighterEffectCategory;
}

// =============================================================================
// EFFECT INSTANCE (applied effect from fighter_effects table)
// =============================================================================

/** Modifier for applied effect instance - uses numeric_value */
export interface FighterEffectModifier {
  id: string;
  fighter_effect_id: string;
  stat_name: string;
  numeric_value: number;
}

/** Applied effect instance on a fighter */
export interface FighterEffect {
  id: string;
  effect_name: string;
  fighter_effect_type_id?: string;
  fighter_equipment_id?: string;
  fighter_effect_modifiers: FighterEffectModifier[];
  type_specific_data?: TypeSpecificData | string;
  created_at?: string;
  updated_at?: string;
}

/** Collection of fighter effects by category */
export interface FighterEffects {
  injuries: FighterEffect[];
}
