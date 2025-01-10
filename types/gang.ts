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
  equipment_name: string;
  cost: number;
} 