export interface EquipmentOption {
  id: string;
  cost: number;
  max_quantity: number;
  equipment_name?: string;
  equipment_type?: string;
  equipment_category?: string;
  displayCategory?: string;
  is_editable?: boolean;
}

export interface DefaultEquipment {
  id: string;
  quantity: number;
  equipment_name?: string;
  equipment_type?: string;
  equipment_category?: string;
  cost?: number;
  is_editable?: boolean;
}

export interface WeaponsSelection {
  default?: DefaultEquipment[];
  options?: EquipmentOption[];
  select_type: 'optional' | 'optional_single' | 'single' | 'multiple';
}

export interface EquipmentSelection {
  weapons?: WeaponsSelection;
}

/**
 * Equipment selection category after normalization for gang UI.
 * Represents a single group of equipment choices (e.g. "Weapons (optional)").
 */
export interface EquipmentSelectionCategory {
  name?: string;
  select_type?: 'optional' | 'optional_single' | 'single' | 'multiple';
  default?: DefaultEquipment[];
  options?: EquipmentOption[];
  replacement_mode?: 'flexible' | 'strict';
}

/**
 * Normalized equipment selection keyed by category ID.
 * This is the UI-facing shape produced by normalizeEquipmentSelection().
 */
export interface NormalizedEquipmentSelection {
  [key: string]: EquipmentSelectionCategory;
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
  free_skill?: boolean;
  delegation_cost?: number | null;
}
