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

/**
 * One fighter_defaults equipment row as the admin fighter type screens edit it. New rows get
 * a client-side id so an accessory can target a weapon added in the same save.
 */
export interface DefaultEquipmentSlot {
  id: string;
  equipment_id: string;
  target_fighter_default_id: string | null;
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
  fighter_subtypes: string[];
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
  save?: number | null;
  edition_slug?: string | null;
  limitation?: number;
  alignment?: string;
  default_equipment: any[];
  is_gang_addition: boolean;
  alliance_id: string;
  alliance_crew_name: string;
  equipment_selection?: EquipmentSelection;
  specialisation?: {
    id: string;
    specialisation_name: string;
  };
  fighter_specialisation_id?: string;
  fighter_variant?: string | null;
  /** Variant family and this row's name within it, both set by /api/fighter-types. */
  typeSubtypeKey?: string;
  variantLabel?: string;
  available_legacies?: Array<{id: string, name: string}>;
  is_spyrer?: boolean;
  free_skill?: boolean;
  delegation_cost?: number | null;
  is_dramatis_personae?: boolean;
  is_custom_fighter?: boolean;
  /** null means N/A: this type cannot gain XP. */
  starting_xp?: number | null;
  is_vehicle?: boolean;
  /** True when this pet's equipment is defaulted on a dramatis personae. */
  is_associated_pet?: boolean;
  /** True when this pet's equipment is defaulted on any other fighter type. */
  is_granted_with_fighter?: boolean;
  /** The dramatis fighter type that grants this pet, when is_associated_pet. */
  associated_pet_owner_id?: string | null;
}

/**
 * A grant or deny rule keyed on a fighter type, as the admin editors hold it. The target is
 * fighter_type_id, or — where the table allows it — every fighter carrying fighter_subtype;
 * the gang_* fields narrow which gangs the rule applies in, and excluded flips a grant into a
 * deny. fighter_type_equipment (an entry on a fighter type's Equipment List) and
 * fighter_type_availability (a fighter type offered to or withheld from a gang) both store
 * this shape.
 *
 * Which combinations are legal is the table's business, not the type's: only
 * fighter_type_availability constrains them, requiring exactly one of fighter_type_id /
 * fighter_subtype with a subtype rule always a deny (target_chk), and at least one gang axis
 * set (scope_chk).
 */
export interface FighterTypeGrant {
  fighter_type_id: string | null;
  fighter_subtype: string | null;
  gang_type_id: string | null;
  gang_origin_id: string | null;
  gang_subtype_id: string | null;
  excluded: boolean;
}
