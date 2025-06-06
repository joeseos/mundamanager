import { VehicleEquipmentProfile } from '@/types/fighter';

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
  fighter_equipment_id: string;
  fighter_weapon_id?: string;
  equipment_id: string;
  equipment_name: string;
  equipment_type: 'weapon' | 'wargear' | 'vehicle_upgrade';
  cost: number;
  base_cost?: number;
  discounted_cost?: number;
  adjusted_cost?: number;
  trading_post_category?: string;
  availability?: string | null;
  equipment_category?: string;
  created_at?: string;
  weapon_profiles?: WeaponProfile[] | null;
  core_equipment?: boolean;
  vehicle_equipment_profiles?: VehicleEquipmentProfile[];
  master_crafted?: boolean;
  is_master_crafted?: boolean;
  is_custom?: boolean;
  equipment_effect?: {
    id: string;
    effect_name: string;
    fighter_effect_type_id?: string;
    fighter_equipment_id: string;
    fighter_effect_modifiers: Array<{
      id: string;
      fighter_effect_id: string;
      stat_name: string;
      numeric_value: number;
    }>;
    type_specific_data?: {
      xp_cost?: number;
      credits_increase?: number;
      [key: string]: any;
    } | string;
    created_at?: string;
  };
} 