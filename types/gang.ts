export interface GangType {
  gang_type_id: string;
  gang_type: string;
  alignment: string;
}

export interface Equipment {
  id: string;
  equipment_name: string;
}

export interface StashItem {
  id: string;
  cost: number;
  type: 'vehicle' | 'equipment';
  vehicle_id?: string;
  vehicle_name?: string;
  equipment_name?: string;
  equipment_type?: 'weapon' | 'wargear' | 'vehicle_upgrade' | 'vehicle_wargear' | 'ammo';
  equipment_category?: string;
} 