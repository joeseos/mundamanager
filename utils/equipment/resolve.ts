/**
 * Resolves what the Equipment modal offers, from the catalogue snapshot
 * (get_equipment_catalogue) and the gang's overlay (get_equipment_overlay), exactly as
 * get_equipment_detailed_data does in SQL. The modal and the buy action both use it.
 *
 * Pure: no React, Supabase or Next imports, and only type imports, so its tests run under
 * plain Node.
 *
 * Each item gets one offer per tab that shows it (fighter's list, Trading Post,
 * Unrestricted), each a row shaped as the RPC returns it. The modal switches tabs without
 * asking the server again.
 */
import type {
  CatalogueAvailabilityRule,
  CatalogueCountLimit,
  CatalogueDiscount,
  CatalogueItem,
  CatalogueListRule,
  CatalogueProfile,
  EquipmentCatalogueCore,
  EquipmentCatalogueGangType,
  EquipmentOverlay,
  OverlayCustomItem,
  OverlayCustomTpStock,
} from '@/types/equipment-catalogue';
import type { EquipmentGrants } from '@/types/equipment';

/** The modal's tabs, as equipment.tsx names them. */
export type EquipmentTab = 'fighters-list' | 'fighters-tradingpost' | 'unrestricted';

export const EQUIPMENT_TABS: readonly EquipmentTab[] = ['fighters-list', 'fighters-tradingpost', 'unrestricted'];

export interface EquipmentContext {
  /**
   * The modal's fighter type: the fighter's official type, else its custom type; the
   * vehicle type for an N23 vehicle; null for the gang's stash.
   */
  typeId: string | null;
  /** The N23 "Add Vehicle Equipment" modal. */
  isVehicle: boolean;
  /** The Gang Legacy switch. */
  legacy: boolean;
}

export interface ResolvedWeaponProfile {
  id: string;
  profile_name: string;
  range_short: string | null;
  range_long: string | null;
  acc_short: string | null;
  acc_long: string | null;
  strength: string | null;
  ap: string | null;
  damage: string | null;
  lethality: string | null;
  ammo: string | null;
  traits: string | null;
  sort_order: number | null;
}

/**
 * One row as get_equipment_detailed_data returns it, less created_at and is_editable, which the
 * modal does not read.
 */
export interface ResolvedEquipmentRow {
  id: string;
  equipment_name: string;
  availability: string | null;
  base_cost: number | null;
  adjusted_cost: number | null;
  trade_points: string | null;
  equipment_category: string;
  equipment_type: 'weapon' | 'wargear' | 'vehicle_upgrade';
  fighter_type_equipment: boolean;
  equipment_tradingpost: boolean;
  is_custom: boolean;
  weapon_profiles: ResolvedWeaponProfile[];
  vehicle_upgrade_slot: string | null;
  grants_equipment: EquipmentGrants | null;
  trading_post_names: string[];
  cost_resource_name: string | null;
  cost_resource_amount: number | null;
  cost_type_resource_id: string | null;
  cost_campaign_resource_id: string | null;
  banned: boolean;
  min_count: number | null;
  max_count: number | null;
}

export interface ResolvedItem {
  id: string;
  /** The row each tab shows, for the tabs that show the item. */
  offers: Partial<Record<EquipmentTab, ResolvedEquipmentRow>>;
}

export type ResolvedEquipment = Map<string, ResolvedItem>;

// ---------------------------------------------------------------------------------------------
// Decoding the snapshot files
// ---------------------------------------------------------------------------------------------

interface ItemDef {
  id: string;
  edition: string;
  name: string;
  category: string;
  type: ResolvedEquipmentRow['equipment_type'];
  cost: number;
  availability: string | null;
  tradePoints: string | null;
  core: boolean;
  slot: string | null;
  grants: EquipmentGrants | null;
  profiles: CatalogueProfile[] | null;
}

interface ListRule {
  /** A fighter type (gang type files), an N23 vehicle type (core), or null: a gang-wide rule. */
  type: string | null;
  /** From a gang type file, so `type` is a fighter type. */
  fighterTypeRule: boolean;
  gangType: string | null;
  origin: string | null;
  gangSubtype: string | null;
  fighterSubtype: string | null;
  excluded: boolean;
}

interface AvailabilityRule {
  gangType: string | null;
  origin: string | null;
  gangSubtype: string | null;
  availability: string | null;
  exclusive: boolean;
}

interface DiscountRule {
  gangType: string | null;
  fighterType: string | null;
  origin: string | null;
  adjustedCost: number | null;
  tradePoints: string | null;
}

interface CountLimitRule {
  forFighterType: string | null;
  gangType: string | null;
  origin: string | null;
  gangSubtype: string | null;
  min: number | null;
  max: number | null;
}

interface TradingPostDef {
  name: string;
  stock: Set<string>;
}

export interface CatalogueIndex {
  items: Map<string, ItemDef>;
  listRules: Map<string, ListRule[]>;
  availability: Map<string, AvailabilityRule[]>;
  discounts: Map<string, DiscountRule[]>;
  countLimits: Map<string, CountLimitRule[]>;
  tradingPosts: Map<string, TradingPostDef>;
  /** gang type -> its own Trading Post */
  ownTradingPost: Map<string, string>;
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Decodes the files once; the result can be kept while the catalogue version stays the same. */
export function buildCatalogueIndex(
  cores: EquipmentCatalogueCore[],
  ruleFiles: EquipmentCatalogueGangType[]
): CatalogueIndex {
  const index: CatalogueIndex = {
    items: new Map(),
    listRules: new Map(),
    availability: new Map(),
    discounts: new Map(),
    countLimits: new Map(),
    tradingPosts: new Map(),
    ownTradingPost: new Map(),
  };
  const itemIdsByEdition = new Map<string, string[]>();

  for (const core of cores) {
    const ref = (i: number | null) => (i === null ? null : core.refs[i]);
    const ids = core.items.map((item: CatalogueItem) => item[0]);
    itemIdsByEdition.set(core.edition, ids);

    for (const item of core.items) {
      const [id, name, category, type, cost, availability, tradePoints, core_, slot, grants, profiles] = item;
      index.items.set(id, {
        id,
        edition: core.edition,
        name,
        category,
        type,
        cost,
        availability,
        tradePoints,
        core: core_ === 1,
        slot,
        grants,
        profiles,
      });
    }
    for (const [item, type, gangType, origin, gangSubtype, fighterSubtype, excluded] of core.listRules as CatalogueListRule[]) {
      push(index.listRules, ids[item], {
        type: ref(type),
        fighterTypeRule: false,
        gangType: ref(gangType),
        origin: ref(origin),
        gangSubtype: ref(gangSubtype),
        fighterSubtype,
        excluded: excluded === 1,
      });
    }
    for (const [item, gangType, origin, gangSubtype, availability, exclusive] of core.availability as CatalogueAvailabilityRule[]) {
      push(index.availability, ids[item], {
        gangType: ref(gangType),
        origin: ref(origin),
        gangSubtype: ref(gangSubtype),
        availability,
        exclusive: exclusive === 1,
      });
    }
    for (const [item, gangType, fighterType, origin, adjustedCost, tradePoints] of core.discounts as CatalogueDiscount[]) {
      push(index.discounts, ids[item], {
        gangType: ref(gangType),
        fighterType: ref(fighterType),
        origin: ref(origin),
        adjustedCost,
        tradePoints,
      });
    }
    for (const [item, forFighterType, gangType, origin, gangSubtype, min, max] of core.countLimits as CatalogueCountLimit[]) {
      push(index.countLimits, ids[item], {
        forFighterType: ref(forFighterType),
        gangType: ref(gangType),
        origin: ref(origin),
        gangSubtype: ref(gangSubtype),
        min,
        max,
      });
    }
    for (const [post, name, stock] of core.tradingPosts) {
      const id = core.refs[post];
      const def = index.tradingPosts.get(id) ?? { name, stock: new Set<string>() };
      for (const item of stock) def.stock.add(ids[item]);
      index.tradingPosts.set(id, def);
    }
    for (const [gangType, post] of core.gangTypes) {
      index.ownTradingPost.set(core.refs[gangType], core.refs[post]);
    }
  }

  for (const file of ruleFiles) {
    const ids = itemIdsByEdition.get(file.edition);
    if (!ids) continue;
    const ref = (i: number | null) => (i === null ? null : file.refs[i]);
    for (const [item, type, gangType, origin, gangSubtype, fighterSubtype, excluded] of file.listRules) {
      push(index.listRules, ids[item], {
        type: ref(type),
        fighterTypeRule: true,
        gangType: ref(gangType),
        origin: ref(origin),
        gangSubtype: ref(gangSubtype),
        fighterSubtype,
        excluded: excluded === 1,
      });
    }
  }

  return index;
}

// ---------------------------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------------------------

/** The database's collation (en_US.UTF-8), for the Trading Post names array_agg(DISTINCT) sorts. */
const collator = new Intl.Collator('en-US');

function sortedNames(names: Iterable<string | null>): string[] {
  return Array.from(new Set(Array.from(names).filter((n): n is string => n !== null))).sort(collator.compare);
}

function toProfiles(profiles: CatalogueProfile[] | null): ResolvedWeaponProfile[] {
  return (profiles ?? []).map(
    ([id, profile_name, range_short, range_long, acc_short, acc_long, strength, ap, damage, ammo, traits, sort_order, lethality]) => ({
      id,
      profile_name,
      range_short,
      range_long,
      acc_short,
      acc_long,
      strength,
      ap,
      damage,
      lethality,
      ammo,
      traits,
      sort_order,
    })
  );
}

/** The cheapest Trade Points: "E" or blank count as 0, other text as 0, ties by text. */
function tradePointsKey(tp: string): number {
  if (tp.trim().toUpperCase() === 'E' || tp.trim() === '') return 0;
  if (/^[0-9]+$/.test(tp)) return Number(tp);
  return 0;
}

interface MergedCustomTerms {
  costOverride: number | null;
  adjustedCost: number | null;
  availability: string | null;
  paidWithResource: boolean;
  resourceName: string | null;
  resourceAmount: number | null;
  campaignTypeResource: string | null;
  campaignResource: string | null;
  banned: boolean;
  names: string[];
}

/**
 * Merges the campaign custom Trading Posts' terms for one item, as the RPC's custom_tp_override
 * and custom_tp do: the lowest cost override and price win; the other terms come from the first
 * post that sets them, ordered by cost override (unset last), sort order (unset as 999) and
 * creation time; any ban bans.
 */
function mergeCustomTerms(rows: OverlayCustomTpStock[]): MergedCustomTerms {
  const ordered = [...rows].sort((a, b) => {
    const ca = a[3];
    const cb = b[3];
    if (ca !== cb) {
      if (ca === null) return 1;
      if (cb === null) return -1;
      return ca - cb;
    }
    const sa = a[12] ?? 999;
    const sb = b[12] ?? 999;
    if (sa !== sb) return sa - sb;
    if (a[13] !== b[13]) return a[13] < b[13] ? -1 : 1;
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  });
  const first = <T>(pick: (row: OverlayCustomTpStock) => T | null): OverlayCustomTpStock | undefined =>
    ordered.find((row) => pick(row) !== null);
  const min = (values: (number | null)[]) => {
    const set = values.filter((v): v is number => v !== null);
    return set.length > 0 ? Math.min(...set) : null;
  };

  const typeRow = first((r) => r[6]);
  const campaignRow = first((r) => r[7]);
  const reputation = ordered.some((r) => r[10] === 1);
  const campaignTypeResource = typeRow ? typeRow[6] : null;
  const campaignResource = campaignRow ? campaignRow[7] : null;
  const paidWithResource = campaignTypeResource !== null || campaignResource !== null || reputation;

  return {
    costOverride: min(ordered.map((r) => r[3])),
    adjustedCost: min(ordered.map((r) => r[4])),
    availability: first((r) => r[5])?.[5] ?? null,
    paidWithResource,
    resourceName: reputation ? 'Reputation' : (typeRow?.[8] ?? campaignRow?.[8] ?? null),
    resourceAmount: paidWithResource ? (first((r) => r[9])?.[9] ?? null) : null,
    campaignTypeResource,
    campaignResource,
    banned: ordered.some((r) => r[11] === 1),
    names: sortedNames(ordered.map((r) => r[2])),
  };
}

export function resolveEquipment(
  index: CatalogueIndex,
  overlay: EquipmentOverlay,
  context: EquipmentContext
): ResolvedEquipment {
  const { gang, fighter } = overlay;
  const { typeId, isVehicle } = context;
  const gangSubtypes = gang.subtypes ?? [];

  // The modal sends fighter_id, which brings in the fighter's legacy and own subtypes, only
  // for a fighter (not a vehicle) with the Legacy switch on or a gang with an affiliation.
  const fighterRecord = !isVehicle && fighter !== null && (context.legacy || gang.affiliation !== null);
  // Without it, the subtypes are those of the type the modal sent.
  const typeSubtypes =
    fighter !== null && typeId !== null && (typeId === fighter.fighterType || typeId === fighter.customFighterType)
      ? fighter.typeSubtypes
      : [];
  const fighterSubtypes = fighterRecord ? (fighter!.subtypes ?? typeSubtypes) : typeSubtypes;
  const legacyType = fighterRecord ? fighter!.legacyFighterType : null;
  const affiliationType = gang.affiliationFighterType;
  // A custom fighter's own list, when the modal's type is that custom type.
  const customList =
    fighter !== null && typeId !== null && typeId === fighter.customFighterType ? new Set(fighter.list) : new Set<string>();

  const ownPost = gang.gangType !== null ? index.ownTradingPost.get(gang.gangType) : undefined;
  const ownPosts = ownPost ? [ownPost] : [];

  const stockByItem = new Map<string, OverlayCustomTpStock[]>();
  for (const row of overlay.customTpStock) push(stockByItem, row[0], row);

  const scopeMatches = (rule: { gangType: string | null; origin: string | null; gangSubtype: string | null }) =>
    (rule.origin === null || rule.origin === gang.origin) &&
    (rule.gangSubtype === null || gangSubtypes.includes(rule.gangSubtype)) &&
    (rule.gangType === null || rule.gangType === gang.gangType);

  const result: ResolvedEquipment = new Map();

  // ------------------------------------------------------------------------- official items
  for (const item of index.items.values()) {
    const listRules = index.listRules.get(item.id) ?? [];
    const availability = index.availability.get(item.id) ?? [];
    const discounts = index.discounts.get(item.id) ?? [];
    const countLimits = index.countLimits.get(item.id) ?? [];
    const customListed = customList.has(item.id);

    // fighter_type_equipment rows that grant the item. Legacy rules apply only on the tabs that
    // send fighter_type_equipment (the fighter's list and the combined Trading Post tab).
    const grantsFor = (listMode: boolean) =>
      listRules.filter(
        (rule) =>
          !rule.excluded &&
          ((rule.type !== null &&
            ((typeId !== null && rule.type === typeId) ||
              (listMode && legacyType !== null && rule.type === legacyType) ||
              (affiliationType !== null && rule.type === affiliationType))) ||
            (rule.type === null && rule.fighterSubtype !== null)) &&
          scopeMatches(rule) &&
          (rule.fighterSubtype === null || fighterSubtypes.includes(rule.fighterSubtype))
      );

    // A deny withholds the item whatever grants it. N23 vehicle rows cannot deny.
    const deniedFor = (listMode: boolean) =>
      listRules.some((rule) => {
        if (!rule.excluded || (!rule.fighterTypeRule && rule.type !== null)) return false;
        const fighterType = rule.fighterTypeRule ? rule.type : null;
        return (
          (fighterType === null ||
            (typeId !== null && fighterType === typeId) ||
            (listMode && legacyType !== null && fighterType === legacyType) ||
            (affiliationType !== null && fighterType === affiliationType)) &&
          scopeMatches(rule) &&
          (rule.fighterSubtype === null || fighterSubtypes.includes(rule.fighterSubtype))
        );
      });

    // Rarity rows for the gang's subtypes or origin also put the item on the list.
    const subtypeRows = availability.filter((r) => r.gangSubtype !== null && gangSubtypes.includes(r.gangSubtype));
    const originRows = availability.filter((r) => r.origin !== null && r.origin === gang.origin);
    const gangTypeRows = availability.filter((r) => r.gangType !== null && r.gangType === gang.gangType);

    const evaluate = (listMode: boolean) => {
      const grants = grantsFor(listMode);
      const onList =
        (grants.length > 0 || subtypeRows.length > 0 || originRows.length > 0 || customListed) && !deniedFor(listMode);
      // Core equipment shows only when a fighter type's or a gang-wide rule grants it, it is
      // on the custom list, or there is no fighter type at all.
      const passesCoreGate =
        !item.core || grants.some((rule) => rule.fighterTypeRule || rule.type === null) || customListed || typeId === null;
      return { onList, passesCoreGate };
    };

    const discountFor = (listMode: boolean) => {
      const originItem = gang.origin !== null && discounts.some((d) => d.origin === gang.origin);
      const applies = (d: DiscountRule) =>
        (originItem
          ? d.origin === gang.origin
          : gang.gangType !== null && d.gangType === gang.gangType && d.fighterType === null) ||
        (typeId !== null && d.fighterType === typeId) ||
        (listMode && legacyType !== null && d.fighterType === legacyType) ||
        (affiliationType !== null && d.fighterType === affiliationType);
      const matched = discounts.filter(applies);
      const costs = matched.map((d) => d.adjustedCost).filter((c): c is number => c !== null);
      const tradePoints = matched
        .map((d) => d.tradePoints)
        .filter((tp): tp is string => tp !== null)
        .sort((a, b) => tradePointsKey(a) - tradePointsKey(b) || collator.compare(a, b));
      return {
        adjustedCost: costs.length > 0 ? Math.min(...costs) : null,
        tradePoints: tradePoints.length > 0 ? tradePoints[0] : null,
      };
    };

    // Trading Post access. An item exclusive to some gang types is sold only to those.
    const exclusiveRows = availability.filter((r) => r.exclusive && r.gangType !== null);
    const allowed = exclusiveRows.length === 0 || exclusiveRows.some((r) => r.gangType === gang.gangType);
    const accessFor = (posts: string[], customRows: OverlayCustomTpStock[]) => {
      const names: (string | null)[] = [];
      let access = false;
      for (const post of posts) {
        const def = index.tradingPosts.get(post);
        if (def?.stock.has(item.id)) {
          access = true;
          names.push(def.name);
        }
      }
      for (const row of customRows) {
        access = true;
        names.push(row[2]);
      }
      return allowed && access ? { access: true, names: sortedNames(names) } : { access: false, names: [] };
    };

    const listRarity =
      (originRows[0]?.availability ?? null) ??
      (subtypeRows[0]?.availability ?? null) ??
      (gangTypeRows[0]?.availability ?? null) ??
      item.availability;

    const countLimit = countLimits.find(
      (limit) =>
        (limit.forFighterType === null || limit.forFighterType === typeId) && scopeMatches(limit)
    );

    const base = {
      id: item.id,
      equipment_name: item.name,
      equipment_category: item.category,
      equipment_type: item.type,
      is_custom: false,
      weapon_profiles: toProfiles(item.profiles),
      vehicle_upgrade_slot: item.slot,
      grants_equipment: item.grants,
      min_count: countLimit?.min ?? null,
      max_count: countLimit?.max ?? null,
    };
    const noCustomTerms = {
      cost_resource_name: null,
      cost_resource_amount: null,
      cost_type_resource_id: null,
      cost_campaign_resource_id: null,
      banned: false,
    };

    const offers: ResolvedItem['offers'] = {};

    // Fighter's list: fighter_type_equipment = true.
    {
      const { onList, passesCoreGate } = evaluate(true);
      if (onList && passesCoreGate) {
        const tp = accessFor(ownPosts, []);
        offers['fighters-list'] = {
          ...base,
          ...noCustomTerms,
          availability: listRarity,
          base_cost: item.cost,
          adjusted_cost: discountFor(true).adjustedCost ?? item.cost,
          trade_points: '0',
          fighter_type_equipment: true,
          equipment_tradingpost: tp.access,
          trading_post_names: tp.names,
        };
      }
    }

    // Trading Post: equipment_tradingpost = true, with fighter_type_equipment = true as well
    // for a fighter (not a vehicle), with the campaign's posts. Every row takes the Trading
    // Post price.
    const customRows = stockByItem.get(item.id) ?? [];
    {
      const combined = typeId !== null && !isVehicle;
      const { onList, passesCoreGate } = evaluate(combined);
      const tp = accessFor(overlay.tradingPosts, customRows);
      if (passesCoreGate && ((combined && onList) || tp.access)) {
        const terms = customRows.length > 0 ? mergeCustomTerms(customRows) : null;
        offers['fighters-tradingpost'] = {
          ...base,
          availability: terms?.availability ?? item.availability,
          base_cost: terms?.paidWithResource ? item.cost : (terms?.costOverride ?? item.cost),
          adjusted_cost: terms?.paidWithResource
            ? item.cost
            : (terms?.adjustedCost ?? terms?.costOverride ?? item.cost),
          trade_points: discountFor(combined).tradePoints ?? item.tradePoints,
          fighter_type_equipment: onList,
          equipment_tradingpost: tp.access,
          trading_post_names: tp.names,
          cost_resource_name: terms?.resourceName ?? null,
          cost_resource_amount: terms?.resourceAmount ?? null,
          cost_type_resource_id: terms?.campaignTypeResource ?? null,
          cost_campaign_resource_id: terms?.campaignResource ?? null,
          banned: terms?.banned ?? false,
        };
      }
    }

    // Unrestricted: neither flag, and only the gang's edition.
    {
      const { onList, passesCoreGate } = evaluate(false);
      if (passesCoreGate && (gang.edition === null || item.edition === gang.edition)) {
        const tp = accessFor(ownPosts, []);
        const discount = discountFor(false);
        offers['unrestricted'] = {
          ...base,
          ...noCustomTerms,
          availability: listRarity,
          base_cost: item.cost,
          adjusted_cost: discount.adjustedCost ?? item.cost,
          trade_points: discount.tradePoints ?? item.tradePoints,
          fighter_type_equipment: onList,
          equipment_tradingpost: tp.access,
          trading_post_names: tp.names,
        };
      }
    }

    if (Object.keys(offers).length > 0) {
      result.set(item.id, { id: item.id, offers });
    }
  }

  // --------------------------------------------------------------------------- custom items
  for (const custom of overlay.customItems) {
    const [id, name, category, type, cost, availability, tradePoints, profiles, tpOnly] = custom as OverlayCustomItem;
    const listed = customList.has(id);
    const customRows = stockByItem.get(id) ?? [];
    const base = {
      id,
      equipment_name: name ?? '',
      equipment_category: category ?? '',
      equipment_type: type,
      is_custom: true,
      weapon_profiles: toProfiles(profiles),
      vehicle_upgrade_slot: null,
      grants_equipment: null,
      fighter_type_equipment: listed,
      equipment_tradingpost: true,
      min_count: null,
      max_count: null,
    };
    const plain = {
      ...base,
      availability,
      base_cost: cost,
      adjusted_cost: cost,
      trading_post_names: [],
      cost_resource_name: null,
      cost_resource_amount: null,
      cost_type_resource_id: null,
      cost_campaign_resource_id: null,
      banned: false,
    };

    const offers: ResolvedItem['offers'] = {};
    // Items seen only through a campaign custom post show on the Trading Post tab only.
    if (tpOnly === 0 && listed) offers['fighters-list'] = { ...plain, trade_points: '0' };
    {
      const terms = customRows.length > 0 ? mergeCustomTerms(customRows) : null;
      offers['fighters-tradingpost'] = {
        ...base,
        availability: terms?.availability ?? availability,
        base_cost: terms?.paidWithResource ? cost : (terms?.costOverride ?? cost),
        adjusted_cost: terms?.paidWithResource ? cost : (terms?.adjustedCost ?? terms?.costOverride ?? cost),
        trade_points: tradePoints,
        trading_post_names: terms?.names ?? [],
        cost_resource_name: terms?.resourceName ?? null,
        cost_resource_amount: terms?.resourceAmount ?? null,
        cost_type_resource_id: terms?.campaignTypeResource ?? null,
        cost_campaign_resource_id: terms?.campaignResource ?? null,
        banned: terms?.banned ?? false,
      };
    }
    if (tpOnly === 0) offers['unrestricted'] = { ...plain, trade_points: tradePoints };

    result.set(id, { id, offers });
  }

  return result;
}

/** The rows a tab shows, as get_equipment_detailed_data returns them for that tab's request. */
export function equipmentForTab(resolved: ResolvedEquipment, tab: EquipmentTab): ResolvedEquipmentRow[] {
  const rows: ResolvedEquipmentRow[] = [];
  for (const item of resolved.values()) {
    const row = item.offers[tab];
    if (row) rows.push(row);
  }
  return rows;
}

/** The core files and gang type files the overlay says the modal needs. */
export function catalogueFilesFor(overlay: EquipmentOverlay): {
  coreEditions: string[];
  ruleFiles: [edition: string, gangType: string][];
} {
  const coreEditions = [
    ...(overlay.gang.edition ? [overlay.gang.edition] : []),
    ...overlay.otherEditions.filter((e) => e !== overlay.gang.edition),
  ];
  return { coreEditions, ruleFiles: overlay.ruleFiles };
}

/** The versioned URL of a catalogue file (app/api/equipment/catalogue). */
export function catalogueFileUrl(version: number, edition: string, gangType: string | null = null): string {
  return `/api/equipment/catalogue/${version}/${edition}${gangType ? `/${gangType}` : ''}`;
}
