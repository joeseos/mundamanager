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
 * Builds a FighterProps object from server response data
 */
export function buildFighterFromServerData(
  data: AddFighterServerData,
  fighterTypeId: string,
  subTypeName?: string
): FighterProps {
  const displayCost = data.rating_cost || data.cost;

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
    movement: data.stats.movement,
    weapon_skill: data.stats.weapon_skill,
    ballistic_skill: data.stats.ballistic_skill,
    strength: data.stats.strength,
    toughness: data.stats.toughness,
    wounds: data.stats.wounds,
    initiative: data.stats.initiative,
    attacks: data.stats.attacks,
    leadership: data.stats.leadership,
    cool: data.stats.cool,
    willpower: data.stats.willpower,
    intelligence: data.stats.intelligence,
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
    effects: createEmptyEffects(),
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
