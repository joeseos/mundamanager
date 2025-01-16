export interface WeaponProfile {
  id: string;
  profile_name: string;
  range_short: string;
  range_long: string;
  acc_short: number;
  acc_long: number | null;
  strength: string;
  damage: number;
  ap: number;
  ammo: number;
  traits: string;
  is_default_profile: boolean;
  weapon_group_id?: string | null;
}

export interface Weapon {
  fighter_weapon_id: string;
  weapon_id: string;
  weapon_name: string;
  weapon_profiles: WeaponProfile[];
}
