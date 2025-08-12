import { Weapon } from './weapon';
import { Equipment as BaseEquipment } from '@/types/equipment';

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
}

export interface FighterEffectCategory {
  id: string;
  created_at: string; // Timestamp with timezone
  updated_at: string | null; // Timestamp with timezone, can be null
  category_name: string
}

// First, let's define the effect categories as a type
export type EffectCategory = 'injuries' | 'advancements' | 'bionics' | 'cyberteknika' | 'gene-smithing' | 'rig-glitches' | 'augmentations' | 'equipment' | 'user';

export interface Skill {
  id: string;
  name: string;
  xp_cost: number;
  credits_increase: number;
  acquired_at: string;
  is_advance: boolean;
  fighter_injury_id: string | null;
}

export interface FighterEffect {
  id: string;
  effect_name: string;
  fighter_effect_type_id?: string;
  fighter_effect_modifiers: {
    id: string;
    fighter_effect_id: string;
    stat_name: string;
    numeric_value: number;
  }[];
  type_specific_data?: {
    xp_cost?: number;
    credits_increase?: number;
    [key: string]: any;
  } | string;
  created_at?: string; // Explicitly mark as optional
}

export interface FighterEffects {
  injuries: FighterEffect[];
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
}>;

export interface FighterProps {
  id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_type_id?: string;
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
  };
  vehicles?: Vehicle[];
  
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
}

export interface WeaponProfile {
  id: string;
  profile_name: string;
  range_short: string;
  range_long: string;
  acc_short: string;
  acc_long: string;
  strength: string;
  ap: string;
  damage: string;
  ammo: string;
  traits: string;
  weapon_group_id: string;
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
  'Brute'
] as const;

export type FighterClass = typeof FIGHTER_CLASSES[number];

