import { Equipment as BaseEquipment, WeaponProfile, Weapon } from '@/types/equipment';
import type { 
  FighterEffectCategory, 
  FighterEffect, 
  FighterEffects,
  FighterEffectModifier,
  EffectCategoryName,
  TypeSpecificData
} from '@/types/fighter-effect';

// Re-export fighter effect types from centralized location
export type { 
  FighterEffectCategory, 
  FighterEffect, 
  FighterEffects,
  FighterEffectModifier,
  TypeSpecificData
};
export type EffectCategory = EffectCategoryName;

// Re-export types for backward compatibility
export type { WeaponProfile, Weapon };

export interface FighterType {
  id: string;
  fighter_type: string;
  fighter_class: string;
  fighter_class_id?: string;
  gang_type_id: string;
  gang_type: string;
  fighter_sub_type: string;
  fighter_sub_type_id?: string;
  fighter_sub_types?: {
    sub_type_name: string;
  } | null;
  alliance_crew_name?: string;
  cost: number;
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  attacks: number;
  special_rules?: string[];
  free_skill: boolean;
  default_equipment?: string[];
  is_spyrer?: boolean;
}

export interface WargearItem {
  fighter_weapon_id: string;
  wargear_id: string;
  wargear_name: string;
  cost: number;
  is_master_crafted?: boolean;
}

export interface WeaponProps {
  fighter_weapon_id: string;
  weapon_id: string;
  weapon_name: string;
  cost: number;
  weapon_profiles: any[];
  is_master_crafted?: boolean;
  effect_names?: string[]; // Names of effects that target this weapon
  equipment_category?: string; // Equipment category for the weapon
}

export interface Skill {
  id: string;
  name: string;
  xp_cost: number;
  credits_increase: number;
  acquired_at: string;
  is_advance: boolean;
  fighter_injury_id: string | null;
}

export interface VehicleEquipment extends BaseEquipment {
  vehicle_id: string;
  vehicle_equipment_id: string;
  vehicle_weapon_id?: string;
}

export interface Vehicle {
  id: string;
  created_at: string;
  vehicle_name: string;
  vehicle_type_id: string;
  vehicle_type: string;
  cost?: number;
  movement: number;
  front: number;
  side: number;
  rear: number;
  hull_points: number;
  handling: number;
  save: number;
  body_slots?: number;
  body_slots_occupied?: number;
  drive_slots?: number;
  drive_slots_occupied?: number;
  engine_slots?: number;
  engine_slots_occupied?: number;
  special_rules: string[];
  equipment: Array<BaseEquipment & Partial<VehicleEquipment>>;
  effects?: {
    [key: string]: FighterEffect[];
  };
}

// Define a standard skills type that all components should use
export type FighterSkills = Record<string, {
  id: string;
  credits_increase: number;
  xp_cost: number;
  is_advance: boolean;
  acquired_at: string;
  fighter_injury_id?: string | null;
  injury_name?: string;
  custom_skill_id?: string | null;
}>;

export interface FighterProps {
  id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_type_id?: string;
  custom_fighter_type_id?: string | null;
  is_custom_fighter?: boolean;
  alliance_crew_name?: string;
  label?: string;
  credits: number;
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
  kill_count?: number;
  gang_id?: string;
  advancements: {
    characteristics: Record<string, any>;
    skills: Record<string, Skill>;
  };
  weapons: WeaponProps[];
  wargear: WargearItem[];
  special_rules?: string[];
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  starved?: boolean;
  recovery?: boolean;
  captured?: boolean;
  free_skill?: boolean;
  fighter_class?: string;
  fighter_class_id?: string;
  note?: string;
  effects: {
    injuries: FighterEffect[];
    advancements: FighterEffect[];
    bionics: FighterEffect[];
    cyberteknika: FighterEffect[];
    'gene-smithing': FighterEffect[];
    'rig-glitches': FighterEffect[];
    augmentations: FighterEffect[];
    equipment: FighterEffect[];
    user: FighterEffect[];
    skills: FighterEffect[];
    'power-boosts': FighterEffect[];
  };
  vehicles?: Vehicle[];
  is_spyrer?: boolean;
  
  // Base stats (original values)
  base_stats: {
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
  };
  
  // Current stats (after modifications)
  current_stats: {
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
  };

  skills?: FighterSkills; // Use the standardized type

  fighter_sub_type?: {
    fighter_sub_type: string;
    fighter_sub_type_id: string;
  } | null;
  
  owner_name?: string; // Name of the fighter who owns this fighter (for exotic beasts)
  beast_equipment_stashed?: boolean; // Whether the equipment granting this beast is in stash
  image_url?: string; // URL to the fighter's image
  active_loadout_id?: string; // ID of the currently active loadout
  loadout_cost?: number; // Cost with active loadout equipment only (for fighter card display)
  selected_archetype_id?: string | null; // ID of the selected skill archetype (for Underhive Outcasts)
}

// Update the FIGHTER_CLASSES to include all classes from fighterClassRank
export const FIGHTER_CLASSES = [
  'Leader',
  'Champion',
  'Prospect',
  'Specialist',
  'Ganger',
  'Juve',
  'Crew',
  'Exotic Beast',
  'Exotic Beast Specialist',
  'Brute'
] as const;

export type FighterClass = typeof FIGHTER_CLASSES[number];

// Archetype interface for Underhive Outcasts skill access
export interface Archetype {
  id: string;
  name: string;
  description: string | null;
  skill_access: Array<{
    skill_type_id: string;
    access_level: 'primary' | 'secondary';
  }>;
}

// Custom Fighter Type interface
export interface CustomFighterType {
  id: string;
  user_id: string;
  fighter_type: string;
  gang_type: string;
  cost: number;
  movement?: number;
  weapon_skill?: number;
  ballistic_skill?: number;
  strength?: number;
  toughness?: number;
  wounds?: number;
  initiative?: number;
  attacks?: number;
  leadership?: number;
  cool?: number;
  willpower?: number;
  intelligence?: number;
  gang_type_id?: string;
  special_rules?: string[];
  free_skill?: boolean;
  fighter_class?: string;
  fighter_class_id?: string;
  skill_access?: {
    skill_type_id: string;
    access_level: 'primary' | 'secondary' | 'allowed';
    skill_type_name?: string;
  }[];
  default_skills?: {
    skill_id: string;
    skill_name: string;
    skill_type_id: string;
  }[];
  default_equipment?: {
    equipment_id: string;
    equipment_name: string;
  }[];
  created_at: string;
  updated_at?: string;
}

