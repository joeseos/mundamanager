import { Weapon } from './weapon';

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

export interface Injury {
  id: string;
  injury_name: string;
  code_1?: string;
  characteristic_1?: number;
  code_2?: string;
  characteristic_2?: number;
  acquired_at: string;
}

export interface Vehicle {
  id: string;
  created_at: string;
  movement: number;
  front: number;
  side: number;
  rear: number;
  hull_points: number;
  handling: number;
  save: number;
  body_slots: number;
  drive_slots: number;
  engine_slots: number;
  special_rules: string[];
  vehicle_name: string;
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
  injuries: Injury[];
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

export interface Equipment {
  fighter_weapon_id: string;
  equipment_id: string;
  equipment_name: string;
  equipment_type: 'weapon' | 'wargear';
  cost: number;
  weapon_profiles?: WeaponProfile[];
}
