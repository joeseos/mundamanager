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

/**
 * The Equipment modal's per-gang overlay, from get_equipment_overlay
 * (supabase/functions/get_equipment_overlay.sql): what the snapshot cannot hold because it
 * depends on the gang, its campaign, the fighter or the viewer. Ids are uuids.
 */
export const EQUIPMENT_OVERLAY_FORMAT = 1;

/** Custom equipment the viewer can see. */
export type OverlayCustomItem = [
  id: string,
  name: string | null,
  category: string | null,
  type: 'weapon' | 'wargear' | 'vehicle_upgrade',
  cost: number | null,
  availability: string | null,
  tradePoints: string,
  profiles: CatalogueProfile[] | null,
  /** Seen only because a campaign custom Trading Post stocks it, so on the Trading Post tab only. */
  tpOnly: CatalogueFlag,
];

/**
 * One campaign custom Trading Post's terms for one item it stocks, official or custom, as they
 * apply to this gang. Trading Post tab only.
 */
export type OverlayCustomTpStock = [
  item: string,
  post: string,
  postName: string | null,
  costOverride: number | null,
  /** The lowest price set for this gang's gang type, custom gang type or origin. */
  adjustedCost: number | null,
  /** The rarity set for this gang's scope, else the post's rarity override. */
  availability: string | null,
  campaignTypeResource: string | null,
  campaignResource: string | null,
  /** The name of this row's campaign type resource or campaign resource. */
  resourceName: string | null,
  resourceAmount: number | null,
  reputation: CatalogueFlag,
  banned: CatalogueFlag,
  sortOrder: number | null,
  /** UTC, ISO 8601 with microseconds, so it sorts as text. */
  createdAt: string,
];

export interface EquipmentOverlay {
  format: typeof EQUIPMENT_OVERLAY_FORMAT;
  /** The current catalogue version, which names the snapshot files to load. */
  version: number;
  gang: {
    id: string;
    gangType: string | null;
    customGangType: string | null;
    edition: string | null;
    origin: string | null;
    subtypes: string[];
    alignment: 'Outlaw' | 'Law Abiding' | 'Unaligned' | null;
    affiliation: string | null;
    affiliationFighterType: string | null;
  };
  /** [edition, gang type] files holding the fighter's, its legacy's and the affiliation's lists. */
  ruleFiles: [edition: string, gangType: string][];
  /** Editions besides the gang's whose core files the modal needs. */
  otherEditions: string[];
  /** The official Trading Posts the Trading Post tab sells from. */
  tradingPosts: string[];
  /** The requested fighter, when it belongs to the gang. */
  fighter: {
    id: string;
    fighterType: string | null;
    /** Only for a fighter without an official type. */
    customFighterType: string | null;
    /** null when unset, in which case its type's subtypes apply. */
    subtypes: string[] | null;
    typeSubtypes: string[];
    legacyFighterType: string | null;
    /** Official and custom items on the custom fighter type's equipment list. */
    list: string[];
  } | null;
  customItems: OverlayCustomItem[];
  customTpStock: OverlayCustomTpStock[];
}
