export interface EquipmentOption {
  id: string;
  cost: number;
  max_quantity: number;
  equipment_name: string;
}

export interface WeaponsSelection {
  options: EquipmentOption[];
  select_type: 'single' | 'multiple';
}

export interface EquipmentSelection {
  weapons?: WeaponsSelection;
}

export interface FighterType {
  id: string;
  fighter_type_id: string;
  fighter_type: string;
  fighter_class: string;
  gang_type: string;
  cost: number;
  gang_type_id: string;
  special_rules: string[];
  total_cost: number;
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
  default_equipment: any[];
  is_gang_addition: boolean;
  equipment_selection?: EquipmentSelection;
} 