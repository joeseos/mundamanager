import { Equipment } from '@/types/equipment';
import { VehicleEquipment } from '@/types/fighter';
import { TypeSpecificData, FighterEffectModifier } from '@/types/fighter-effect';

/** Vehicle effect modifier (same structure as fighter effect modifier) */
export type VehicleEffectModifier = FighterEffectModifier;

/** Vehicle effect (uses same type_specific_data as fighter effects) */
export interface VehicleEffect {
  id: string;
  effect_name: string;
  fighter_equipment_id?: string;
  type_specific_data?: TypeSpecificData;
  created_at?: string;
  updated_at?: string;
  fighter_effect_modifiers?: VehicleEffectModifier[];
}

export interface VehicleEffects {
  'lasting damages'?: VehicleEffect[];
  'vehicle upgrades'?: VehicleEffect[];
  hardpoint?: VehicleEffect[];
  user?: VehicleEffect[];
  [key: string]: VehicleEffect[] | undefined;
}

export interface VehicleProps {
  id: string;
  gang_id: string;
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
  body_slots: number;
  body_slots_occupied: number;
  drive_slots: number;
  drive_slots_occupied: number;
  engine_slots: number;
  engine_slots_occupied: number;
  special_rules: string[];
  cost: number;
  payment_cost?: number; // Actual cost paid (may differ from rating cost)
  created_at: string;
  fighter_id?: string | null;
  equipment: Array<Equipment & Partial<VehicleEquipment>>;
  effects?: VehicleEffects;
} 