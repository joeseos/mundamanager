export interface FighterType {
  id: string;
  fighter_type: string;
  fighter_class: string;
  cost: number;
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  attacks: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  special_rules?: string[];
  gang_type_id: string;
  gang_type: string;
  fighter_class_id?: string;
  free_skill?: string;
  total_cost?: number;
} 