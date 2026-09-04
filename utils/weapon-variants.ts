import { Weapon, WeaponProfile } from '@/types/equipment';
import { FighterEffect, Vehicle } from '@/types/fighter';

/**
 * Weapon table row derivation, split out of fighter-card-weapon-table so it runs
 * once per weapon set rather than once per render. Comments below mark the places
 * where an obvious simplification would change rendered output.
 */

// Names sort case/accent-insensitively. Cached because passing options defeats the
// cached-collator fast path behind localeCompare, so the inline
// localeCompare(x, undefined, {...}) form built one per comparison. The bare
// localeCompare() used for traits already hits that fast path -- leave it alone.
const baseCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

const ARC_ORDER = ['Front', 'Left', 'Right', 'Rear'];

export interface WeaponVariantRow {
  profile: WeaponProfile;
  /** How many distinct weapon instances contribute this profile — renders as "(xN)". */
  duplicate: number;
  /** Traits, already sorted and joined for display. */
  traitsText: string;
}

export interface WeaponVariantBlock {
  weaponName: string;
  isMasterCrafted: boolean;
  hardpointLocation?: string;
  effectNames?: string[];
  /** True when the block holds more than one distinct base profile name, which suppresses "(xN)". */
  multipleBaseNames: boolean;
  rows: WeaponVariantRow[];
}

/** Shared empty result: callers with no vehicle keep a constant reference, and
 *  freezing means a stray push/sort throws rather than corrupting every caller. */
export const NO_WEAPONS: Weapon[] = [];
Object.freeze(NO_WEAPONS);

/**
 * Vehicle equipment shaped into Weapon rows, folding in each weapon's hardpoint
 * effect. `unknownLocationLabel` differs between callers -- 'Loc. unknown' on the
 * fighter card, 'Unknown' on the print roster -- so it stays a parameter.
 */
export function buildVehicleWeapons(
  vehicle: Vehicle | undefined,
  unknownLocationLabel: string
): Weapon[] {
  if (!vehicle?.equipment) return NO_WEAPONS;

  const hardpoints = (vehicle.effects?.['hardpoint'] || []) as FighterEffect[];

  return vehicle.equipment
    .filter(item => item.equipment_type === 'weapon')
    .map(weapon => {
      const weaponFighterId = weapon.fighter_weapon_id || weapon.vehicle_weapon_id || weapon.equipment_id;
      const matchedHardpoint = hardpoints.find(hp => hp.fighter_equipment_id === weaponFighterId);
      const hpData = matchedHardpoint?.type_specific_data && typeof matchedHardpoint.type_specific_data !== 'string'
        ? matchedHardpoint.type_specific_data
        : undefined;

      return {
        fighter_weapon_id: weaponFighterId,
        weapon_id: weapon.equipment_id,
        weapon_name: weapon.is_master_crafted || weapon.master_crafted
          ? `${weapon.equipment_name} (Master-crafted)`
          : weapon.equipment_name,
        weapon_profiles: weapon.weapon_profiles?.map(profile => ({
          ...profile,
          range_short: profile.range_short,
          range_long: profile.range_long,
          strength: profile.strength,
          ap: profile.ap,
          damage: profile.damage,
          ammo: profile.ammo,
          acc_short: profile.acc_short,
          acc_long: profile.acc_long,
          traits: profile.traits || '',
          id: profile.id,
          profile_name: profile.profile_name,
          is_master_crafted: (profile as any).is_master_crafted || !!weapon.master_crafted || !!weapon.is_master_crafted
        })) || [],
        cost: weapon.cost,
        ...(hpData && {
          hardpoint_location: (hpData.location && String(hpData.location).trim()) || unknownLocationLabel,
          hardpoint_arcs: Array.isArray(hpData.arcs) ? hpData.arcs as string[] : undefined,
          hardpoint_operated_by: (hpData.operated_by === 'crew' || hpData.operated_by === 'passenger') ? hpData.operated_by : undefined,
        }),
      };
    }) as unknown as Weapon[];
}

/** Stat signature, used to group weapons with identical statlines. */
function createProfileSignature(profile: WeaponProfile): string {
  return [
    profile.range_short,
    profile.range_long,
    profile.acc_short,
    profile.acc_long,
    profile.strength,
    profile.ap,
    profile.damage,
    profile.lethality,
    profile.ammo,
    profile.traits
  ].join('|');
}

interface VariantBlockDraft {
  weaponName: string;
  isMasterCrafted: boolean;
  baseProfiles: Array<{ profile: WeaponProfile; weaponId: string }>;
  specials: Map<string, WeaponProfile>;
  effectNames?: string[];
  hardpointLocation?: string;
  hardpointArcs?: string[];
  hardpointOperatedBy?: 'crew' | 'passenger';
}

function buildTraitsText(
  profile: WeaponProfile,
  block: VariantBlockDraft,
  entity?: 'crew' | 'vehicle'
): string {
  const traitsList: string[] = [];

  if (entity === 'crew') traitsList.push('Arc (Front)');
  if (profile.traits) traitsList.push(profile.traits);
  // Only master-crafted profiles get the trait, never the ammo profiles alongside them
  if (profile.is_master_crafted) traitsList.push('Master-crafted');

  const { hardpointArcs, hardpointOperatedBy } = block;
  if (hardpointArcs && hardpointArcs.length > 0) {
    if (ARC_ORDER.every(a => hardpointArcs.includes(a))) {
      traitsList.push('Arc (All Round)');
    } else {
      traitsList.push(`Arc (${ARC_ORDER.filter(a => hardpointArcs.includes(a)).join(', ')})`);
    }
  }

  if (hardpointOperatedBy === 'crew') {
    traitsList.push('Crew Operated');
  } else if (hardpointOperatedBy === 'passenger') {
    traitsList.push('Passenger Operated');
  }

  traitsList.sort((a, b) => a.localeCompare(b));
  return traitsList.join(', ');
}

/**
 * Group a fighter's weapons into the blocks and rows the weapon table renders.
 *
 * `entity` only reaches the trait list (crew weapons gain "Arc (Front)"); every other
 * presentational prop stays in the component.
 */
export function buildWeaponVariantRows(
  weapons: Weapon[] | null | undefined,
  entity?: 'crew' | 'vehicle'
): WeaponVariantBlock[] {
  if (!weapons || weapons.length === 0) return [];

  // Keep separate from the grouping pass: two entries can share a fighter_weapon_id
  // (buildVehicleWeapons falls back to equipment_id), and this map is last-write-wins
  // for that collision. Fusing the passes would make each weapon read its own status
  // instead, changing which render as "(MC)".
  const weaponMasterCraftedStatus = new Map<string, boolean>();
  weapons.forEach((weapon) => {
    const isMasterCrafted = weapon.weapon_profiles?.some(p => p.is_master_crafted)
      || weapon.weapon_name.includes('Master-crafted')
      || weapon.weapon_name.includes('(MC)')
      || (weapon as any).is_master_crafted;
    weaponMasterCraftedStatus.set(weapon.fighter_weapon_id, isMasterCrafted || false);
  });

  const variantMap = new Map<string, VariantBlockDraft>();

  weapons.forEach((weapon) => {
    const baseProfilesForWeapon = weapon.weapon_profiles?.filter(p => !p.profile_name?.startsWith('-')) || [];

    const weaponProfileSignature = baseProfilesForWeapon
      .map(createProfileSignature)
      .sort()
      .join('||');

    // Weapons with different effects stay separate even when their stats match
    const effectSignature = weapon.effect_names && weapon.effect_names.length > 0
      ? weapon.effect_names.slice().sort().join(',')
      : 'noeffects';

    const isWeaponMasterCrafted = weaponMasterCraftedStatus.get(weapon.fighter_weapon_id) || false;
    const hardpointKey = weapon.hardpoint_location || 'no-hp';

    weapon.weapon_profiles?.forEach((profile) => {
      const groupId = profile.weapon_group_id || weapon.fighter_weapon_id;
      const key = `${groupId}|${isWeaponMasterCrafted ? 'mc' : 'reg'}|${weaponProfileSignature}|${effectSignature}|${hardpointKey}`;

      let block = variantMap.get(key);
      if (!block) {
        block = {
          weaponName: profile.profile_name?.startsWith('-') ? '' : (profile.profile_name || ''),
          isMasterCrafted: isWeaponMasterCrafted,
          baseProfiles: [],
          specials: new Map<string, WeaponProfile>(),
          effectNames: weapon.effect_names && weapon.effect_names.length > 0 ? weapon.effect_names : undefined,
          hardpointLocation: weapon.hardpoint_location,
          hardpointArcs: weapon.hardpoint_arcs,
          hardpointOperatedBy: weapon.hardpoint_operated_by,
        };
        variantMap.set(key, block);
      }

      if (profile.profile_name?.startsWith('-')) {
        // First special of a name wins; a plain set() would keep the last
        if (!block.specials.has(profile.profile_name)) block.specials.set(profile.profile_name, profile);
      } else {
        block.baseProfiles.push({ profile, weaponId: weapon.fighter_weapon_id });
        // Only path that names a block created by a special-first profile
        if (!block.weaponName) block.weaponName = profile.profile_name || '';
      }
    });
  });

  // The orphan-specials filter has to stay a post-pass: a block can be created by a
  // special profile and gain base profiles from a later weapon in the same group.
  return Array.from(variantMap.values())
    .filter((b) => b.baseProfiles.length)
    .sort((a, b) => {
      const cmp = baseCollator.compare(a.weaponName, b.weaponName);
      return cmp !== 0 ? cmp : Number(a.isMasterCrafted) - Number(b.isMasterCrafted);
    })
    .map((block) => {
      // Counts DISTINCT weapon ids, so two profiles from one weapon are not duplicates.
      // Plain object, not a Map: integer-like profile names iterate in numeric order
      // here, and switching container would reorder those rows.
      const baseGroups: Record<string, { profile: WeaponProfile; weaponIds: Set<string> }> = {};
      block.baseProfiles.forEach(({ profile, weaponId }) => {
        const profileKey = profile.profile_name || '';
        if (!baseGroups[profileKey]) {
          baseGroups[profileKey] = { profile, weaponIds: new Set() };
        }
        baseGroups[profileKey].weaponIds.add(weaponId);
      });

      const baseNames = Object.keys(baseGroups);
      const duplicateCounts = baseNames.map((name) => ({
        profile: baseGroups[name].profile,
        duplicate: baseGroups[name].weaponIds.size
      }));

      const specialRows = Array.from(block.specials.values()).sort((a, b) => {
        const aOrder = a.sort_order ?? 0;
        const bOrder = b.sort_order ?? 0;
        return aOrder !== bOrder ? aOrder - bOrder : baseCollator.compare(a.profile_name, b.profile_name);
      });

      const rows: WeaponVariantRow[] = [
        ...duplicateCounts,
        ...specialRows.map((profile) => ({ profile, duplicate: 1 })),
      ].map(({ profile, duplicate }) => ({
        profile,
        duplicate,
        traitsText: buildTraitsText(profile, block, entity)
      }));

      return {
        weaponName: block.weaponName,
        isMasterCrafted: block.isMasterCrafted,
        hardpointLocation: block.hardpointLocation,
        effectNames: block.effectNames,
        multipleBaseNames: baseNames.length > 1,
        rows
      };
    });
}
