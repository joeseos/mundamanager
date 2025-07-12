export interface GangType {
  gang_type_id: string;
  gang_type: string;
  alignment: string;
  note?: string;
}

export interface Equipment {
  id: string;
  equipment_name: string;
  equipment_category: string;
}

export interface StashItem {
  id: string;
  cost: number;
  type: 'vehicle' | 'equipment';
  vehicle_id?: string;
  vehicle_name?: string;
  equipment_name?: string;
  equipment_type?:
    | 'weapon'
    | 'wargear'
    | 'vehicle_upgrade'
    | 'vehicle_wargear'
    | 'ammo';
  equipment_category?: string;
  equipment_id?: string;
  custom_equipment_id?: string;
}
