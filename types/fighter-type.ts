export interface EquipmentOption {
  id: string;
  cost: number;
  max_quantity: number;
  equipment_name?: string;
  is_editable?: boolean;
}

export interface DefaultEquipment {
  id: string;
  quantity: number;
  is_editable?: boolean;
}

export interface WeaponsSelection {
  default?: DefaultEquipment[];
  options?: EquipmentOption[];
  select_type: 'optional' | 'single' | 'multiple';
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
  limitation?: number;
  alignment?: string;
  default_equipment: any[];
  is_gang_addition: boolean;
  alliance_id: string;
  alliance_crew_name: string;
  equipment_selection?: EquipmentSelection;
  sub_type?: {
    id: string;
    sub_type_name: string;
  };
  fighter_sub_type_id?: string;
  available_legacies?: Array<{id: string, name: string}>;
  is_spyrer?: boolean;
} 