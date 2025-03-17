import { Weapon } from './weapon';
import { Equipment as BaseEquipment } from '@/types/equipment';

export interface FighterType {
  id: string;
  fighter_type: string;
  gang_type_id: string;
  gang_type: string;
  fighter_class: string;
  fighter_class_id?: string;
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
}

export interface WeaponProps {
  fighter_weapon_id: string;
  weapon_id: string;
  weapon_name: string;
  cost: number;
  weapon_profiles: any[];
}

export interface FighterEffectCategory {
  id: string;
  created_at: string; // Timestamp with timezone
  updated_at: string | null; // Timestamp with timezone, can be null
  category_name: string
}

export interface FighterEffectStatModifier {
  id: string; // UUID
  fighter_effect_id: string; // FK to FighterEffect
  stat_name: string; // e.g., "intelligence ", "willpower "
  numeric_value: number; // Positive for bonus, negative for penalty
}


export interface FighterEffect {
  id: string; // UUID
  effect_name: string; // e.g., "head injury"
  type_specific_data?: string; // Optional text notes
  created_at: string; // Timestamp with timezone
  updated_at: string | null; // Timestamp with timezone, can be null
  fighter_effect_categories: FighterEffectCategory;
  fighter_effect_modifiers: FighterEffectStatModifier[]; // Note the property name change
}

export interface FighterEffects {
  injuries: FighterEffect[];
}


export interface VehicleEquipmentProfile {
  id: string;
  created_at: string;
  equipment_id: string;
  movement: number | null;
  front: number | null;
  side: number | null;
  rear: number | null;
  hull_points: number | null;
  save: number | null;
  handling: number | null;
  profile_name: string;
  upgrade_type: 'body' | 'drive' | 'engine';
}

export interface VehicleEquipment extends BaseEquipment {
  vehicle_id: string;
  vehicle_equipment_id: string;
  vehicle_weapon_id?: string;
  vehicle_equipment_profiles?: VehicleEquipmentProfile[];
}

export interface Vehicle {
  id: string;
  created_at: string;
  vehicle_name: string;
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
  equipment: Array<BaseEquipment & Partial<VehicleEquipment> & {
    vehicle_equipment_profiles?: VehicleEquipmentProfile[];
  }>;
}

export interface FighterProps {
  id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_type_id?: string;
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
    skills: Record<string, any>;
  };
  weapons: WeaponProps[];
  wargear: WargearItem[];
  special_rules?: string[];
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  starved?: boolean;
  free_skill?: boolean;
  fighter_class?: string;
  note?: string;
  effects: {
    injuries: Array<FighterEffect>;
    advancements: Array<FighterEffect>;
  }
  vehicles?: Vehicle[];
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
  is_default_profile: boolean;
}

