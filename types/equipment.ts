export interface WeaponProfile {
  id: string;
  profile_name: string;
  range_short: number;
  range_long: number;
  acc_short: number;
  acc_long: number | null;
  strength: number;
  ap: number;
  damage: number;
  ammo: number;
  traits: string | null;
  is_default_profile: boolean;
}

export interface Equipment {
  equipment_id: string;
  equipment_name: string;
  equipment_type: 'weapon' | 'wargear';
  cost: number;
  base_cost?: number;
  discounted_cost?: number;
  fighter_equipment_id: string;
  weapon_profiles?: WeaponProfile[];
  fighter_type_equipment: boolean;
  core_equipment?: boolean;
} 