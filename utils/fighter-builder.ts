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
    intelligence: stats.intelligence
  };
}

/**
 * Server response data for a created fighter
 */
export interface AddFighterServerData {
  fighter_id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_class: string;
  fighter_sub_type_id?: string;
  free_skill: boolean;
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
 * Server response data for created exotic beasts
 */
export interface ExoticBeastServerData {
  id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_class: string;
  fighter_type_id: string;
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
  xp: number;
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
  subTypeName?: string
): FighterProps {
  const displayCost = data.rating_cost ?? data.cost;

  return {
    id: data.fighter_id,
    fighter_name: data.fighter_name,
    fighter_type_id: fighterTypeId,
    fighter_type: data.fighter_type,
    fighter_class: data.fighter_class,
    fighter_sub_type: data.fighter_sub_type_id ? {
      fighter_sub_type_id: data.fighter_sub_type_id,
      fighter_sub_type: subTypeName || ''
    } : undefined,
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
    xp: data.stats.xp,
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
 * Builds a FighterProps object from exotic beast server data
 */
export function buildBeastFromServerData(beast: ExoticBeastServerData): FighterProps {
  const stats: FighterStats = {
    movement: beast.movement,
    weapon_skill: beast.weapon_skill,
    ballistic_skill: beast.ballistic_skill,
    strength: beast.strength,
    toughness: beast.toughness,
    wounds: beast.wounds,
    initiative: beast.initiative,
    attacks: beast.attacks,
    leadership: beast.leadership,
    cool: beast.cool,
    willpower: beast.willpower,
    intelligence: beast.intelligence
  };

  return {
    id: beast.id,
    fighter_name: beast.fighter_name,
    fighter_type: beast.fighter_type,
    fighter_class: beast.fighter_class,
    fighter_type_id: beast.fighter_type_id,
    credits: beast.credits,
    owner_name: beast.owner?.fighter_name,
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
    xp: beast.xp,
    kills: beast.kills,
    weapons: buildWeaponsFromEquipment(beast.equipment),
    wargear: buildWargearFromEquipment(beast.equipment),
    special_rules: beast.special_rules || [],
    skills: buildSkillsFromServerData(beast.skills),
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
