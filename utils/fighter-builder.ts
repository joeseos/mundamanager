import { FighterProps, FighterSkills } from '@/types/fighter';

/**
 * Stats structure used for base_stats and current_stats
 */
export interface FighterStats {
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  attacks: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  save?: number | null;
}

/**
 * Empty effects structure for new fighters
 */
export const EMPTY_FIGHTER_EFFECTS = {
  injuries: [],
  advancements: [],
  bionics: [],
  cyberteknika: [],
  'gene-smithing': [],
  'rig-glitches': [],
  'power-boosts': [],
  augmentations: [],
  equipment: [],
  user: [],
  skills: []
} as const;

/**
 * Creates empty effects structure (returns new object each time to avoid mutation)
 */
export function createEmptyEffects(): FighterProps['effects'] {
  return {
    injuries: [],
    advancements: [],
    bionics: [],
    cyberteknika: [],
    'gene-smithing': [],
    'rig-glitches': [],
    'power-boosts': [],
    augmentations: [],
    equipment: [],
    user: [],
    skills: []
  };
}

/**
 * Creates a stats object from individual stat values
 */
export function createStats(stats: FighterStats): FighterStats {
  return {
    movement: stats.movement,
    weapon_skill: stats.weapon_skill,
    ballistic_skill: stats.ballistic_skill,
    strength: stats.strength,
    toughness: stats.toughness,
    wounds: stats.wounds,
    initiative: stats.initiative,
    attacks: stats.attacks,
    leadership: stats.leadership,
    cool: stats.cool,
    willpower: stats.willpower,
    intelligence: stats.intelligence,
    save: stats.save ?? null
  };
}

/**
 * Server response data for a created fighter
 */
export interface AddFighterServerData {
  fighter_id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_subtypes?: string[];
  fighter_specialisation_id?: string | null;
  fighter_variant?: string | null;
  free_skill: boolean;
  starting_xp: number | null;
  rating_cost?: number;
  cost: number;
  base_stats: FighterStats;
  current_stats: FighterStats;
  stats: FighterStats & { xp: number; kills: number };
  equipment: Array<{
    fighter_equipment_id: string;
    equipment_id: string;
    equipment_name: string;
    equipment_type: string;
    cost: number;
    weapon_profiles?: any[];
  }>;
  skills: Array<{
    skill_id: string;
    skill_name: string;
  }>;
  special_rules?: string[];
  applied_effects?: Array<{
    id: string;
    effect_name: string;
    type_specific_data?: any;
    created_at: string;
    category_name?: string;
    fighter_effect_modifiers: Array<{
      fighter_effect_id: string;
      stat_name: string;
      numeric_value: number;
      operation?: 'add' | 'set';
    }>;
  }>;
}

/**
 * Server response data for a created Exotic Beast (N23) or Pet (N26).
 */
export interface FamiliarServerData {
  id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_subtypes?: string[];
  fighter_type_id: string;
  fighter_gang_type_id?: string | null;
  fighter_custom_gang_type_id?: string | null;
  credits: number;
  owner?: { fighter_name: string };
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  attacks: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  save?: number | null;
  xp: number;
  /** null means N/A: this familiar's type cannot gain XP. */
  starting_xp?: number | null;
  kills: number;
  equipment: Array<{
    fighter_equipment_id: string;
    equipment_id: string;
    equipment_name: string;
    equipment_type: string;
    cost: number;
    weapon_profiles?: any[];
  }>;
  skills?: Array<{
    skill_id: string;
    skill_name: string;
  }>;
  special_rules?: string[];
}

/**
 * Converts server equipment data to weapons array
 */
export function buildWeaponsFromEquipment(equipment: AddFighterServerData['equipment']): FighterProps['weapons'] {
  return equipment
    .filter(item => item.equipment_type === 'weapon')
    .map(item => ({
      weapon_name: item.equipment_name,
      weapon_id: item.equipment_id,
      cost: item.cost,
      fighter_weapon_id: item.fighter_equipment_id,
      weapon_profiles: item.weapon_profiles || []
    }));
}

/**
 * Converts server equipment data to wargear array
 */
export function buildWargearFromEquipment(equipment: AddFighterServerData['equipment']): FighterProps['wargear'] {
  return equipment
    .filter(item => item.equipment_type === 'wargear')
    .map(item => ({
      wargear_name: item.equipment_name,
      wargear_id: item.equipment_id,
      cost: item.cost,
      fighter_weapon_id: item.fighter_equipment_id
    }));
}

/**
 * Converts server skills array to FighterSkills record
 */
export function buildSkillsFromServerData(skills: AddFighterServerData['skills'] | undefined): FighterSkills {
  if (!skills) return {};

  return skills.reduce((acc: FighterSkills, skill) => {
    acc[skill.skill_name] = {
      id: skill.skill_id,
      credits_increase: 0,
      xp_cost: 0,
      is_advance: false,
      acquired_at: new Date().toISOString(),
      fighter_injury_id: null
    };
    return acc;
  }, {});
}

/**
 * Builds effects object from server-returned applied_effects, grouped by category.
 * Matches the shape produced by the DB-load path in gang-data.ts.
 */
function buildEffectsFromAppliedEffects(
  appliedEffects: AddFighterServerData['applied_effects']
): FighterProps['effects'] {
  const effects = createEmptyEffects();
  if (!appliedEffects) return effects;

  for (const effect of appliedEffects) {
    const category = effect.category_name;
    if (category && category in effects) {
      (effects as Record<string, any[]>)[category].push({
        id: effect.id,
        effect_name: effect.effect_name,
        type_specific_data: effect.type_specific_data,
        created_at: effect.created_at,
        fighter_effect_modifiers: effect.fighter_effect_modifiers.map(mod => ({
          id: mod.fighter_effect_id,
          fighter_effect_id: mod.fighter_effect_id,
          stat_name: mod.stat_name,
          numeric_value: mod.numeric_value,
          operation: mod.operation,
        }))
      });
    }
  }

  return effects;
}

/**
 * Builds a FighterProps object from server response data.
 * Uses base_stats for top-level stats and populates effects from applied_effects,
 * matching the structure produced by the DB-load path (gang-data.ts).
 */
export function buildFighterFromServerData(
  data: AddFighterServerData,
  fighterTypeId: string,
  specialisationName?: string
): FighterProps {
  const displayCost = data.rating_cost ?? data.cost;

  return {
    id: data.fighter_id,
    fighter_name: data.fighter_name,
    fighter_type_id: fighterTypeId,
    fighter_type: data.fighter_type,
    fighter_subtypes: data.fighter_subtypes ?? [],
    fighter_specialisation: data.fighter_specialisation_id ? {
      fighter_specialisation_id: data.fighter_specialisation_id,
      fighter_specialisation: specialisationName || ''
    } : undefined,
    fighter_variant: data.fighter_variant ?? null,
    credits: displayCost,
    movement: data.base_stats.movement,
    weapon_skill: data.base_stats.weapon_skill,
    ballistic_skill: data.base_stats.ballistic_skill,
    strength: data.base_stats.strength,
    toughness: data.base_stats.toughness,
    wounds: data.base_stats.wounds,
    initiative: data.base_stats.initiative,
    attacks: data.base_stats.attacks,
    leadership: data.base_stats.leadership,
    cool: data.base_stats.cool,
    willpower: data.base_stats.willpower,
    intelligence: data.base_stats.intelligence,
    save: data.base_stats.save ?? null,
    xp: data.stats.xp,
    starting_xp: data.starting_xp,
    kills: 0,
    weapons: buildWeaponsFromEquipment(data.equipment),
    wargear: buildWargearFromEquipment(data.equipment),
    special_rules: data.special_rules || [],
    skills: buildSkillsFromServerData(data.skills),
    advancements: {
      characteristics: {},
      skills: {}
    },
    free_skill: data.free_skill || false,
    effects: buildEffectsFromAppliedEffects(data.applied_effects),
    base_stats: createStats(data.base_stats),
    current_stats: createStats(data.current_stats)
  };
}

/**
 * Builds a FighterProps object from Exotic Beast or Pet server data.
 */
export function buildFamiliarFromServerData(familiar: FamiliarServerData): FighterProps {
  const stats: FighterStats = {
    movement: familiar.movement,
    weapon_skill: familiar.weapon_skill,
    ballistic_skill: familiar.ballistic_skill,
    strength: familiar.strength,
    toughness: familiar.toughness,
    wounds: familiar.wounds,
    initiative: familiar.initiative,
    attacks: familiar.attacks,
    leadership: familiar.leadership,
    cool: familiar.cool,
    willpower: familiar.willpower,
    intelligence: familiar.intelligence,
    save: familiar.save ?? null
  };

  return {
    id: familiar.id,
    fighter_name: familiar.fighter_name,
    fighter_type: familiar.fighter_type,
    fighter_subtypes: familiar.fighter_subtypes ?? [],
    fighter_type_id: familiar.fighter_type_id,
    fighter_gang_type_id: familiar.fighter_gang_type_id ?? null,
    fighter_custom_gang_type_id: familiar.fighter_custom_gang_type_id ?? null,
    credits: familiar.credits,
    owner_name: familiar.owner?.fighter_name,
    movement: stats.movement,
    weapon_skill: stats.weapon_skill,
    ballistic_skill: stats.ballistic_skill,
    strength: stats.strength,
    toughness: stats.toughness,
    wounds: stats.wounds,
    initiative: stats.initiative,
    attacks: stats.attacks,
    leadership: stats.leadership,
    cool: stats.cool,
    willpower: stats.willpower,
    intelligence: stats.intelligence,
    save: stats.save ?? null,
    xp: familiar.xp,
    starting_xp: familiar.starting_xp ?? null,
    kills: familiar.kills,
    weapons: buildWeaponsFromEquipment(familiar.equipment),
    wargear: buildWargearFromEquipment(familiar.equipment),
    special_rules: familiar.special_rules || [],
    skills: buildSkillsFromServerData(familiar.skills),
    advancements: {
      characteristics: {},
      skills: {}
    },
    free_skill: false,
    effects: createEmptyEffects(),
    base_stats: createStats(stats),
    current_stats: createStats(stats)
  };
}
