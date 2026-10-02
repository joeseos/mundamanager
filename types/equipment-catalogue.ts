import type { EquipmentGrants } from '@/types/equipment';

/**
 * The Equipment modal's catalogue snapshot, built by get_equipment_catalogue
 * (supabase/functions/get_equipment_catalogue.sql) and served by app/api/equipment/catalogue.
 *
 * Rows are positional tuples to keep the files small:
 * - items are referred to by their position in the core file's `items`, ordered by id, so a
 *   gang type file only matches the core file of the same version and edition;
 * - every other id is a position in the file's own `refs`;
 * - in a scope position `null` means "any"; elsewhere it means "none";
 * - booleans are 0 or 1.
 */
export const EQUIPMENT_CATALOGUE_FORMAT = 1;

/** Position in the core file's `items`. */
export type CatalogueItemIndex = number;
/** Position in the same file's `refs`. */
export type CatalogueRef = number;
export type CatalogueFlag = 0 | 1;

/** Ordered as the modal shows them: sort_order (unset last), then name. */
export type CatalogueProfile = [
  id: string,
  profileName: string,
  rangeShort: string | null,
  rangeLong: string | null,
  accShort: string | null,
  accLong: string | null,
  strength: string | null,
  ap: string | null,
  damage: string | null,
  ammo: string | null,
  traits: string | null,
  sortOrder: number | null,
  lethality: string | null,
];

export type CatalogueItem = [
  id: string,
  name: string,
  category: string,
  type: 'weapon' | 'wargear' | 'vehicle_upgrade',
  cost: number,
  /** Base rarity, before any availability rule. */
  availability: string | null,
  /** Base Trade Points, before any discount. */
  tradePoints: string | null,
  core: CatalogueFlag,
  /** Body, Drive or Engine for an N23 vehicle upgrade. */
  vehicleSlot: 'Body' | 'Drive' | 'Engine' | null,
  /** grants_equipment with each option's equipment_name filled in, options in stored order. */
  grants: EquipmentGrants | null,
  profiles: CatalogueProfile[] | null,
];

/**
 * A fighter's (or vehicle's) equipment list entry. Every matching grant applies; a matching
 * deny (excluded) withholds the item whatever grants it.
 */
export type CatalogueListRule = [
  item: CatalogueItemIndex,
  /** Core file: an N23 vehicle type, or null for a gang-wide subtype rule. Gang type file: a fighter type. */
  type: CatalogueRef | null,
  gangType: CatalogueRef | null,
  origin: CatalogueRef | null,
  gangSubtype: CatalogueRef | null,
  fighterSubtype: string | null,
  excluded: CatalogueFlag,
];

/** Most specific first (origin, then gang subtype, then gang type). Subtype and origin rows also put the item on the fighter's list. */
export type CatalogueAvailabilityRule = [
  item: CatalogueItemIndex,
  gangType: CatalogueRef | null,
  origin: CatalogueRef | null,
  gangSubtype: CatalogueRef | null,
  availability: string | null,
  exclusive: CatalogueFlag,
];

export type CatalogueDiscount = [
  item: CatalogueItemIndex,
  gangType: CatalogueRef | null,
  fighterType: CatalogueRef | null,
  origin: CatalogueRef | null,
  adjustedCost: number | null,
  tradePoints: string | null,
];

/** Ordered by precedence: the first one that matches applies. */
export type CatalogueCountLimit = [
  item: CatalogueItemIndex,
  forFighterType: CatalogueRef | null,
  gangType: CatalogueRef | null,
  origin: CatalogueRef | null,
  gangSubtype: CatalogueRef | null,
  min: number | null,
  max: number | null,
];

export type CatalogueTradingPost = [
  tradingPost: CatalogueRef,
  name: string,
  stock: CatalogueItemIndex[],
];

/** The core file of one edition. */
export interface EquipmentCatalogueCore {
  format: typeof EQUIPMENT_CATALOGUE_FORMAT;
  version: number;
  edition: string;
  refs: string[];
  items: CatalogueItem[];
  /** [gang type, its own Trading Post] for the gang types that have one. */
  gangTypes: [gangType: CatalogueRef, tradingPost: CatalogueRef][];
  tradingPosts: CatalogueTradingPost[];
  /** [legacy, the fighter type it adds, that fighter type's gang type] */
  legacies: [legacy: CatalogueRef, fighterType: CatalogueRef, gangType: CatalogueRef][];
  /** [affiliation, the fighter type it adds, that fighter type's gang type] */
  affiliations: [affiliation: CatalogueRef, fighterType: CatalogueRef, gangType: CatalogueRef][];
  listRules: CatalogueListRule[];
  availability: CatalogueAvailabilityRule[];
  discounts: CatalogueDiscount[];
  countLimits: CatalogueCountLimit[];
}

/** The equipment list rules of the fighter types that belong to one gang type. */
export interface EquipmentCatalogueGangType {
  format: typeof EQUIPMENT_CATALOGUE_FORMAT;
  version: number;
  edition: string;
  gangType: string;
  refs: string[];
  listRules: CatalogueListRule[];
}
