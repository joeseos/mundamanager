import { Equipment } from '@/types/equipment';
import { VehicleEquipment } from '@/types/fighter';

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
} 