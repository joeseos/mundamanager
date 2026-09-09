import type { WeaponProps, WargearItem } from '@/types/fighter';

export interface GangOrigin {
  id: string;
  origin_name: string;
  category_name: string;
}

export interface GangOriginCategory {
  id: string;
  category_name: string;
}

export interface GangType {
  gang_type_id: string;
  gang_type: string;
  alignment: string;
  note?: string;
  edition_id?: string | null;
  gang_origin_category_id?: string;
  available_origins?: GangOrigin[];
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
  equipment_type?: 'weapon' | 'wargear' | 'vehicle_upgrade' | 'vehicle_wargear' | 'ammo';
  equipment_category?: string;
  equipment_id?: string;
  custom_equipment_id?: string;
  cost_resource?: { name: string; amount: number } | null;
}

export interface DefaultImageCredit {
  name?: string;
  url?: string;
  suffix?: string;
}

export function hasDefaultImageCredit(
  credit?: DefaultImageCredit | null
): credit is DefaultImageCredit {
  return Boolean(credit?.name?.trim() || credit?.url?.trim() || credit?.suffix?.trim());
}

export interface DefaultImageEntry {
  url: string;
  credit?: DefaultImageCredit;
}

/**
 * Normalises raw default_image_urls from Supabase.
 * Handles both the legacy string[] format and the new object[] format,
 * so the app works before and after the data migration.
 */
export function normaliseDefaultImageUrls(
  raw: unknown[] | null | undefined
): DefaultImageEntry[] | undefined {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((entry) => {
    if (typeof entry === 'string') {
      return { url: entry };
    }
    return entry as DefaultImageEntry;
  });
}

/** Shown when a gang portrait URL fails to load. */
export const UNKNOWN_GANG_IMAGE_URL =
  'https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/unknown_gang_cropped_web.webp';

/**
 * Custom upload, then the selected type default. Empty or missing `.url`
 * entries fall through so the caller can show a letter placeholder.
 */
export function resolveGangImageUrl(options: {
  imageUrl?: string | null;
  defaultGangImage?: number | null;
  defaultImageUrls?: DefaultImageEntry[] | null;
}): string | undefined {
  const { imageUrl, defaultGangImage, defaultImageUrls } = options;
  if (imageUrl) return imageUrl;

  if (
    defaultGangImage !== null &&
    defaultGangImage !== undefined &&
    Array.isArray(defaultImageUrls) &&
    defaultGangImage >= 0 &&
    defaultGangImage < defaultImageUrls.length
  ) {
    const url = defaultImageUrls[defaultGangImage]?.url;
    if (url) return url;
  }

  return undefined;
}

export interface ResourceUpdate {
  resource_id: string;
  resource_name?: string;  // Optional - can be looked up
  is_custom: boolean;
  quantity_delta: number;
  reason?: string;
}

// =============================================================================
// Gang roster read models
//
// Shared by the cached loaders (app/lib/shared/gang-data.ts) and the pure
// transforms (utils/gang-assembly.ts). They live here so the dependency runs
// one way: loaders -> utils -> types.
// =============================================================================

/**
 * Raw, unprocessed rows for everything fighter/vehicle-shaped in a gang.
 * Fetched once (getGangFightersBundle, tag gang-{id}) and assembled into the
 * page-specific shapes by the pure functions in utils/gang-assembly.ts. The transform logic is
 * moved verbatim from the previous getGangFightersList/getGangVehicles
 * implementations — queries got wider, the logic did not change.
 */
export interface GangFightersBundle {
  gangId: string;
  fighters: any[];
  /** ALL gang vehicles (fighter-assigned and unassigned). */
  vehicles: any[];
  /** fighter_equipment rows for fighters AND vehicles (stash excluded). */
  equipment: any[];
  skills: any[];
  /** fighter_effects rows for fighters AND vehicles (superset select). */
  effects: any[];
  /** fighter_exotic_beasts where the owner is in this gang. */
  beastLinks: any[];
  /** ALL fighter_loadouts for the gang's fighters, with equipment assignments embedded. */
  loadouts: any[];
  /** {id, name} of gangs that captured this gang's fighters. */
  capturedByGangs: any[];
}

export interface GangFighter {
  id: string;
  fighter_name: string;
  label?: string;
  fighter_type: string;
  fighter_subtypes: string[];
  promoted_from_prospect?: boolean;
  fighter_specialisation?: {
    fighter_specialisation: string;
    fighter_specialisation_id: string;
  };
  fighter_variant?: string | null;
  alliance_crew_name?: string;
  position?: string;
  xp: number;
  kills: number;
  credits: number;
  loadout_cost?: number; // Cost of equipment in active loadout only (for fighter card display)
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
  save?: number | null;
  edition_slug?: string | null;
  /** null means N/A: this fighter's type cannot gain XP. */
  starting_xp: number | null;
  weapons: WeaponProps[];
  wargear: WargearItem[];
  effects: Record<string, any[]>;
  skills: Record<string, any>;
  vehicles: any[];
  cost_adjustment?: number;
  special_rules?: string[];
  note?: string;
  killed: boolean;
  starved: boolean;
  retired: boolean;
  enslaved: boolean;
  recovery: boolean;
  captured: boolean;
  free_skill: boolean;
  image_url?: string;
  owner_id?: string;
  owner_name?: string;
  beast_equipment_stashed?: boolean;
  active_loadout_id?: string;
  active_loadout_name?: string;
  /** When true, this entry represents the fighter's in-game active loadout (used for print filtering) */
  isActiveLoadoutForPrint?: boolean;
}

/** Assembly options for assembleGangFighters / getGangFightersList. */
export interface GetGangFightersListOptions {
  /** Emit one entry per loadout instead of one per fighter (print roster). */
  expandLoadoutsForPrint?: boolean;
  /**
   * The owning gang's edition. Supplied by callers that already hold the gang
   * core row; getGangFightersList reads it itself only when this is omitted.
   * Resolved once per roster rather than per fighter, because fighter_types
   * yields null for custom fighter types.
   */
  gangEditionSlug?: string | null;
}

/**
 * One row of the fighter page's navigation Combobox — produced by
 * selectGangFighterIndex and consumed as-is by the client component, so the
 * two cannot drift.
 *
 * `xp` is nullable in the schema (0 nulls in practice); `starting_xp` is
 * genuinely null when the fighter's type cannot gain XP.
 */
export interface GangFighterIndexEntry {
  id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_specialisation_id: string | null;
  promoted_from_prospect: boolean;
  xp: number | null;
  starting_xp: number | null;
  advancements_taken: number;
  killed: boolean;
  retired: boolean;
  enslaved: boolean;
  starved: boolean;
  recovery: boolean;
  captured: boolean;
}
