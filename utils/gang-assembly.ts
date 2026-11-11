import 'server-only';
import { countAdvancementsTaken } from '@/utils/advancementRanks';
import { readHatredTarget } from '@/utils/injuryTarget';
import { WeaponProps, WargearItem } from '@/types/fighter';
import type { CountLimit } from '@/types/fighter-type';
import { WeaponProfile } from '@/types/equipment';
import { applyWeaponModifiers, fighterWideWeaponEffects } from '@/utils/effect-modifiers';
import { gangRulesForWeapon } from '@/utils/gang-rules';
import type {
  GangFighter,
  GangFighterIndexEntry,
  GangFightersBundle,
  GetGangFightersListOptions,
} from '@/types/gang';


export function groupBy<T extends Record<string, any>>(array: T[], key: string): Record<string, T[]> {
  return array.reduce((groups: Record<string, T[]>, item: T) => {
    const groupKey = item[key];
    if (groupKey != null) {
      (groups[groupKey] ||= []).push(item);
    }
    return groups;
  }, {});
}

type RawWeaponProfile = WeaponProfile & { equipment_id: string };
type RawCustomWeaponProfile = WeaponProfile & { custom_equipment_id: string };

const sortProfiles = (profiles: WeaponProfile[]) =>
  profiles.sort((a, b) => {
    const so = (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity);
    return so !== 0 ? so : (a.profile_name ?? '').localeCompare(b.profile_name ?? '');
  });

/**
 * Build weapon-profile lookup maps from the nested profiles on equipment rows.
 */
function buildProfileMaps(equipmentRows: any[]) {
  const standardProfilesMap = new Map<string, WeaponProfile[]>();
  const standardAmmoByParentWeapon = new Map<string, WeaponProfile[]>();
  const customProfilesMap = new Map<string, WeaponProfile[]>();
  const customAmmoByParentWeapon = new Map<string, WeaponProfile[]>();

  const seenStdIds = new Set<string>();
  const seenCustIds = new Set<string>();

  equipmentRows.forEach((item: any) => {
    if (item.equipment_id && item.equipment?.equipment_type === 'weapon') {
      for (const p of (item.equipment.weapon_profiles || []) as RawWeaponProfile[]) {
        if (seenStdIds.has(p.id)) continue;
        seenStdIds.add(p.id);
        if (!standardProfilesMap.has(p.equipment_id)) standardProfilesMap.set(p.equipment_id, []);
        standardProfilesMap.get(p.equipment_id)!.push(p);
        if (p.weapon_group_id && p.weapon_group_id !== p.equipment_id) {
          if (!standardAmmoByParentWeapon.has(p.weapon_group_id)) standardAmmoByParentWeapon.set(p.weapon_group_id, []);
          standardAmmoByParentWeapon.get(p.weapon_group_id)!.push(p);
        }
      }
    }
    if (item.custom_equipment_id && item.custom_equipment?.equipment_type === 'weapon') {
      for (const p of (item.custom_equipment.custom_weapon_profiles || []) as RawCustomWeaponProfile[]) {
        if (seenCustIds.has(p.id)) continue;
        seenCustIds.add(p.id);
        if (!customProfilesMap.has(p.custom_equipment_id)) customProfilesMap.set(p.custom_equipment_id, []);
        customProfilesMap.get(p.custom_equipment_id)!.push(p);
        if (p.weapon_group_id && p.weapon_group_id !== p.custom_equipment_id) {
          if (!customAmmoByParentWeapon.has(p.weapon_group_id)) customAmmoByParentWeapon.set(p.weapon_group_id, []);
          customAmmoByParentWeapon.get(p.weapon_group_id)!.push(p);
        }
      }
    }
  });

  standardProfilesMap.forEach(sortProfiles);
  standardAmmoByParentWeapon.forEach(sortProfiles);
  customProfilesMap.forEach(sortProfiles);
  customAmmoByParentWeapon.forEach(sortProfiles);

  return { standardProfilesMap, standardAmmoByParentWeapon, customProfilesMap, customAmmoByParentWeapon };
}

/** A weapon's profiles from each list in order, each profile once, marked master-crafted like the item. */
function combineProfiles(item: any, ...lists: any[][]): any[] {
  const seenIds = new Set<string>();
  return lists.flat()
    .filter((p: any) => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    })
    .map((profile: any) => ({ ...profile, is_master_crafted: item.is_master_crafted || false }));
}

/** Fighter or vehicle effect rows as the pages list them, grouped by category name. */
function effectsByCategory(rows: any[]): Record<string, any[]> {
  const effects: Record<string, any[]> = {};
  rows.forEach((effectData: any) => {
    const categoryName = effectData.fighter_effect_type?.fighter_effect_category?.category_name || 'uncategorized';
    const effectType = effectData.fighter_effect_type as { sort_order?: number | null } | null;
    (effects[categoryName] ||= []).push({
      id: effectData.id,
      effect_name: effectData.effect_name,
      fighter_effect_type_id: effectData.fighter_effect_type_id,
      fighter_equipment_id: effectData.fighter_equipment_id,
      type_specific_data: effectData.type_specific_data,
      sort_order: effectType?.sort_order ?? effectData.sort_order ?? null,
      created_at: effectData.created_at,
      updated_at: effectData.updated_at,
      fighter_effect_modifiers: effectData.fighter_effect_modifiers || []
    });
  });
  return effects;
}

/** The credits the effects add (type_specific_data.credits_increase). */
const effectCredits = (effects: any[]) =>
  effects.reduce((sum: number, effect: any) => sum + (effect.type_specific_data?.credits_increase || 0), 0);

/** The credits the skills add. */
const skillCredits = (skills: any[]) =>
  skills.reduce((sum: number, skill: any) => sum + (skill.credits_increase || 0), 0);

/** The gang's rules when the fighter is of the gang's own gang type, else none */
function gangRulesFor(bundle: GangFightersBundle, fighterType: { gang_type_id?: string | null } | null | undefined) {
  return bundle.gangTypeId && fighterType?.gang_type_id === bundle.gangTypeId ? bundle.gangRules : [];
}

/**
 * The most specific count_limits rule for this gang, matching get_fighter_types_with_cost:
 * subtype, then origin, then gang type, then a rule for every gang. id breaks a tie.
 */
export function resolveGangCountLimit(
  rules: CountLimit[] | null | undefined,
  gang: {
    gangTypeId?: string | null;
    gangOriginId?: string | null;
    gangSubtypeIds?: string[] | null;
  }
): { min_count: number | null; max_count: number | null } {
  const subtypeIds = new Set(gang.gangSubtypeIds ?? []);
  const matching = (rules ?? []).filter((rule) =>
    (rule.gang_type_id == null || rule.gang_type_id === gang.gangTypeId) &&
    (rule.gang_origin_id == null || rule.gang_origin_id === gang.gangOriginId) &&
    (rule.gang_subtype_id == null || subtypeIds.has(rule.gang_subtype_id))
  );
  matching.sort((a, b) => {
    const specificity = (rule: CountLimit) =>
      (rule.gang_subtype_id ? 4 : 0) + (rule.gang_origin_id ? 2 : 0) + (rule.gang_type_id ? 1 : 0);
    const bySpecificity = specificity(b) - specificity(a);
    if (bySpecificity !== 0) return bySpecificity;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
  const best = matching[0];
  return {
    min_count: best?.min_count ?? null,
    max_count: best?.max_count ?? null,
  };
}

type LoadoutContext = { loadoutId: string | null; loadoutName?: string; isActiveLoadout: boolean };

interface OwnedBeastCosts {
  total: number;
  /** Per beast-granting item: the beast's own equipment and its advancements. */
  byEquipmentId: Record<string, { equipment: number; advancements: number }>;
}

/** One fighter as the gang page shows it, plus what the fighter page lists beside it. */
interface FighterAssembly {
  fighter: GangFighter;
  /** Every item the fighter holds, in or out of the active loadout, with its weapon profiles. */
  equipment: any[];
  /** Every skill, in or out of the active loadout. */
  allSkills: Record<string, any>;
  beastCosts: OwnedBeastCosts;
}

/**
 * The fighter's skills keyed by name. With a loadout active, skills granted
 * by equipment outside it are left out.
 */
function mapSkills(skillsData: any[], activeLoadoutEquipmentIds: Set<string> | null): Record<string, any> {
  const skills: Record<string, any> = {};
  skillsData.forEach((skillData: any) => {
    const skillName = (skillData.skill as any)?.name || (skillData.custom_skill as any)?.skill_name;
    if (skillName) {
      const fe = skillData.fighter_effect_skills?.fighter_effects;

      // Same rule as the effects filter below
      if (
        activeLoadoutEquipmentIds !== null &&
        fe?.fighter_equipment_id &&
        !activeLoadoutEquipmentIds.has(fe.fighter_equipment_id)
      ) {
        return;
      }

      const injuryName = fe?.effect_name;
      const tsd =
        fe?.type_specific_data && typeof fe.type_specific_data === 'object'
          ? (fe.type_specific_data as Record<string, unknown>)
          : null;
      // Hatred (X) target of the granting injury, for the badge on the
      // skills list. readHatredTarget also understands the pre-N26
      // bitter_enmity_* keys, which were deliberately never backfilled.
      const hatredTarget = readHatredTarget(tsd);

      const mapped = {
        id: skillData.id,
        name: skillName,
        credits_increase: skillData.credits_increase || 0,
        xp_cost: skillData.xp_cost || 0,
        is_advance: skillData.is_advance || false,
        custom_skill_id: skillData.custom_skill_id || undefined,
        fighter_injury_id: skillData.fighter_effect_skill_id || undefined,
        injury_name: injuryName || undefined,
        granted_by_equipment_id: fe?.fighter_equipment_id || undefined,
        acquired_at: skillData.created_at,
        ...(hatredTarget
          ? {
              hatred_target_kind: hatredTarget.kind,
              hatred_target_id: hatredTarget.id,
              hatred_target_name: hatredTarget.name,
              hatred_target_colour: hatredTarget.colour
            }
          : {})
      };

      // A granted skill never hides one the fighter bought
      if (!skills[skillName] || skills[skillName].fighter_injury_id) {
        skills[skillName] = mapped;
      }
    }
  });
  return skills;
}

/**
 * Index the bundle once and return a function that assembles one fighter
 * from it. The gang page runs it for every fighter and the fighter page for
 * one, so both pages show the same profiles, effects and cost.
 */
function fighterAssembler(bundle: GangFightersBundle, options?: GetGangFightersListOptions) {
  const gangEditionSlug = options?.gangEditionSlug ?? null;
  const gangScope = {
    gangTypeId: options?.gangTypeId,
    gangOriginId: options?.gangOriginId,
    gangSubtypeIds: options?.gangSubtypeIds,
  };
  const fighters = bundle.fighters;
  const fighterIdSet = new Set(fighters.map((f: any) => f.id));

  // Partition the wide bundle rows into the slices the transform logic expects
  const fighterEquipmentRows = bundle.equipment.filter((e: any) => e.fighter_id && !e.vehicle_id);
  const vehicleEquipmentRows = bundle.equipment.filter((e: any) => e.vehicle_id);
  const fighterEffectsRows = bundle.effects.filter((e: any) => e.fighter_id && fighterIdSet.has(e.fighter_id) && !e.vehicle_id);
  const targetingEffectsRows = bundle.effects.filter((e: any) => e.fighter_id && fighterIdSet.has(e.fighter_id) && e.fighter_equipment_id);
  const vehicleEffectsRows = bundle.effects.filter((e: any) => e.vehicle_id);
  const assignedVehicles = bundle.vehicles.filter((v: any) => v.fighter_id);

  // Weapon profile maps (fighter-held and vehicle-mounted equipment)
  const { standardProfilesMap, standardAmmoByParentWeapon, customProfilesMap, customAmmoByParentWeapon } =
    buildProfileMaps(fighterEquipmentRows);
  const {
    standardProfilesMap: vehicleStandardProfilesMap,
    standardAmmoByParentWeapon: vehicleStandardAmmoByParent,
    customProfilesMap: vehicleCustomProfilesMap,
    customAmmoByParentWeapon: vehicleCustomAmmoByParent
  } = buildProfileMaps(vehicleEquipmentRows);

  // Lookup Maps for O(1) access
  const equipmentByFighter = groupBy(fighterEquipmentRows, 'fighter_id');
  const skillsByFighter = groupBy(bundle.skills, 'fighter_id');
  const effectsByFighter = groupBy(fighterEffectsRows, 'fighter_id');
  const vehiclesByFighter = groupBy(assignedVehicles, 'fighter_id');
  const beastsByOwner = groupBy(bundle.beastLinks, 'fighter_owner_id');

  // Ownership info map (petId -> ownership info)
  const ownershipInfoMap = new Map();
  bundle.beastLinks.forEach((info: any) => {
    ownershipInfoMap.set(info.fighter_pet_id, {
      owner_id: info.fighter_owner_id,
      owner_name: (info.fighters as any)?.fighter_name,
      beast_equipment_stashed: info.fighter_equipment?.gang_stash || false
    });
  });

  // Equipment targeting effects map (targetEquipmentId -> effects with modifiers)
  // Two cases:
  // 1. Rig glitches: fighter_equipment_id = target weapon, target_equipment_id = NULL
  // 2. Equipment-to-equipment (e.g., hotshot laspack): fighter_equipment_id = source, target_equipment_id = target weapon
  const equipmentTargetingEffectsMap = new Map<string, any[]>();
  targetingEffectsRows.forEach((effect: any) => {
    const targetId = effect.target_equipment_id || effect.fighter_equipment_id;
    if (!targetId) return;
    if (!equipmentTargetingEffectsMap.has(targetId)) {
      equipmentTargetingEffectsMap.set(targetId, []);
    }
    equipmentTargetingEffectsMap.get(targetId)!.push(effect);
  });
  // Sort effects by sort_order (type as default, instance as override) and build names map
  const equipmentTargetingEffectNamesMap = new Map<string, string[]>();
  equipmentTargetingEffectsMap.forEach((effects, targetId) => {
    const sorted = [...effects].sort((a: any, b: any) => {
      const effectTypeA = a.fighter_effect_type as { sort_order?: number | null } | null;
      const effectTypeB = b.fighter_effect_type as { sort_order?: number | null } | null;
      const orderA = effectTypeA?.sort_order ?? a.sort_order ?? Infinity;
      const orderB = effectTypeB?.sort_order ?? b.sort_order ?? Infinity;
      return orderA - orderB;
    });
    const names: string[] = [];
    sorted.forEach((effect: any) => {
      if (effect.effect_name && !names.includes(effect.effect_name)) {
        names.push(effect.effect_name);
      }
    });
    equipmentTargetingEffectNamesMap.set(targetId, names);
  });

  // Loadout maps: loadout_id -> Set<fighter_equipment_id>, loadout_id -> name
  const loadoutEquipmentMap = new Map<string, Set<string>>();
  const loadoutNameMap = new Map<string, string>();
  bundle.loadouts.forEach((loadout: any) => {
    loadoutNameMap.set(loadout.id, loadout.loadout_name);
    (loadout.fighter_loadout_equipment || []).forEach((assignment: any) => {
      if (!loadoutEquipmentMap.has(loadout.id)) {
        loadoutEquipmentMap.set(loadout.id, new Set());
      }
      loadoutEquipmentMap.get(loadout.id)!.add(assignment.fighter_equipment_id);
    });
  });

  // Captured-by gang name map: gang_id -> name
  const capturedByGangNameMap = new Map<string, string>();
  bundle.capturedByGangs.forEach((g: any) => {
    capturedByGangNameMap.set(g.id, g.name);
  });

  // Fighter lookup map for O(1) beast lookups
  const fighterLookup = new Map(fighters.map((f: any) => [f.id, f]));

  /** Exotic beasts owned by this fighter: their cost rolls into the owner's. */
  const ownedBeastCosts = (fighterId: string): OwnedBeastCosts => {
    const byEquipmentId: OwnedBeastCosts['byEquipmentId'] = {};
    let total = 0;
    (beastsByOwner[fighterId] || []).forEach((beastRel: any) => {
      const beastFighter: any = fighterLookup.get(beastRel.fighter_pet_id);
      if (!beastFighter || beastFighter.killed || beastFighter.retired || beastFighter.enslaved || beastFighter.captured) {
        return;
      }

      // Get beast's equipment, skills, effects
      const beastEquipment = equipmentByFighter[beastRel.fighter_pet_id] || [];
      const beastSkills = skillsByFighter[beastRel.fighter_pet_id] || [];
      const beastEffects = effectsByFighter[beastRel.fighter_pet_id] || [];

      // Stashed equipment already moved its cost to stash value; the beast's advancements did not.
      const equipmentCost = beastRel.fighter_equipment?.gang_stash
        ? 0
        : beastEquipment.reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0);
      const advancementsCost = skillCredits(beastSkills) + effectCredits(beastEffects) + (beastFighter.cost_adjustment || 0);

      if (beastRel.fighter_equipment_id) {
        byEquipmentId[beastRel.fighter_equipment_id] = { equipment: equipmentCost, advancements: advancementsCost };
      }
      total += ((beastFighter.fighter_types as any)?.cost || 0) + equipmentCost + advancementsCost;
    });
    return { total, byEquipmentId };
  };

  /** Assemble one fighter. Without a loadout context, its active loadout applies. */
  return function assembleFighter(fighter: any, loadoutCtx?: LoadoutContext): FighterAssembly {
    const fighterId = fighter.id;

    // Get fighter-specific data from Maps
    const equipment = equipmentByFighter[fighterId] || [];
    const skillsData = skillsByFighter[fighterId] || [];
    const effectsData = effectsByFighter[fighterId] || [];
    const vehicles = vehiclesByFighter[fighterId] || [];
    const ownershipInfo = ownershipInfoMap.get(fighter.id) || null;

    const activeLoadoutId = loadoutCtx ? loadoutCtx.loadoutId : fighter.active_loadout_id;
    const activeLoadoutEquipmentIds = activeLoadoutId
      ? loadoutEquipmentMap.get(activeLoadoutId) || new Set<string>()
      : null;

    // Helper to check if equipment is in active loadout
    const isInActiveLoadout = (fighterEquipmentId: string) =>
      activeLoadoutEquipmentIds === null || activeLoadoutEquipmentIds.has(fighterEquipmentId);

    // Skills: every skill counts towards cost; the active loadout's are shown
    const allSkills = mapSkills(skillsData, null);
    const skills = activeLoadoutEquipmentIds === null ? allSkills : mapSkills(skillsData, activeLoadoutEquipmentIds);

    // Effects grouped by category; every effect counts towards cost
    const effects = effectsByCategory(effectsData);
    const unfilteredEffectsCost = effectCredits(effectsData);

    // Filter effects by active loadout (for display and stats)
    if (activeLoadoutEquipmentIds !== null) {
      Object.keys(effects).forEach(categoryName => {
        effects[categoryName] = effects[categoryName].filter((effect: any) => {
          // Always show effects without equipment parent (injuries, advancements, etc.)
          if (!effect.fighter_equipment_id) {
            return true;
          }
          // Only show effects whose parent equipment is in active loadout
          return activeLoadoutEquipmentIds.has(effect.fighter_equipment_id);
        });
      });
    }

    // Get THIS fighter's equipment IDs for ammo ownership check
    const fighterStandardIds = new Set(
      equipment.filter((e: any) => e.equipment_id).map((e: any) => e.equipment_id)
    );
    const fighterCustomIds = new Set(
      equipment.filter((e: any) => e.custom_equipment_id).map((e: any) => e.custom_equipment_id)
    );

    // When a loadout is active, set of catalog equipment_id/custom_equipment_id in that loadout (for ammo profile filtering)
    const loadoutEquipmentIds: Set<string> | null = activeLoadoutEquipmentIds
      ? new Set(
          equipment
            .filter((e: any) => activeLoadoutEquipmentIds!.has(e.id))
            .flatMap((e: any) => [
              ...(e.equipment_id ? [e.equipment_id] : []),
              ...(e.custom_equipment_id ? [e.custom_equipment_id] : [])
            ])
        )
      : null;

    const fighterWideEffects = fighterWideWeaponEffects(Object.values(effects).flat());
    const gangRules = gangRulesFor(bundle, fighter.fighter_types);

    // Process equipment and add weapon profiles
    const processedEquipment = equipment.map((item: any) => {
      const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
      let weaponProfiles: any[] = [];

      if (equipmentType === 'weapon') {
        // A weapon in the active loadout only gets ammo that is in it too. A
        // weapon outside it is shown only on the fighter page, with all its ammo.
        const ammoInScope = (catalogId: string) =>
          loadoutEquipmentIds === null || !isInActiveLoadout(item.id) || loadoutEquipmentIds.has(catalogId);

        if (item.equipment_id) {
          // Get base profiles for this weapon
          const baseProfiles = standardProfilesMap.get(item.equipment_id) || [];

          // Get ammo profiles ONLY if THIS fighter owns the ammo
          const standardAmmo = (standardAmmoByParentWeapon.get(item.equipment_id) || [])
            .filter((p: any) => fighterStandardIds.has(p.equipment_id) && ammoInScope(p.equipment_id));
          const customAmmo = (customAmmoByParentWeapon.get(item.equipment_id) || [])
            .filter((p: any) => fighterCustomIds.has(p.custom_equipment_id) && ammoInScope(p.custom_equipment_id));

          weaponProfiles = combineProfiles(item, baseProfiles, standardAmmo, customAmmo);
        } else if (item.custom_equipment_id) {
          // Get base profiles for this custom weapon
          const baseProfiles = customProfilesMap.get(item.custom_equipment_id) || [];

          // Get ammo profiles ONLY if THIS fighter owns the ammo
          const customAmmo = (customAmmoByParentWeapon.get(item.custom_equipment_id) || [])
            .filter((p: any) => fighterCustomIds.has(p.custom_equipment_id) && ammoInScope(p.custom_equipment_id));
          const standardAmmo = (standardAmmoByParentWeapon.get(item.custom_equipment_id) || [])
            .filter((p: any) => fighterStandardIds.has(p.equipment_id) && ammoInScope(p.equipment_id));

          weaponProfiles = combineProfiles(item, baseProfiles, customAmmo, standardAmmo);
        }
      }

      // Apply equipment-targeted effect modifiers to weapon profiles
      if (weaponProfiles.length > 0) {
        const targetingEffects = [...(equipmentTargetingEffectsMap.get(item.id) || []), ...fighterWideEffects];
        if (targetingEffects.length > 0) {
          weaponProfiles = applyWeaponModifiers(weaponProfiles, targetingEffects);
        }
        // After the fighter's own effects, so a trait an upgrade adds counts
        weaponProfiles = applyWeaponModifiers(weaponProfiles, gangRulesForWeapon(gangRules, item));
      }

      // Get effect names that target this equipment
      const effect_names = equipmentTargetingEffectNamesMap.get(item.id) || [];

      return {
        fighter_equipment_id: item.id,
        equipment_id: item.equipment_id || undefined,
        custom_equipment_id: item.custom_equipment_id || undefined,
        equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
        equipment_type: equipmentType || 'unknown',
        equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
        purchase_cost: item.purchase_cost || 0,
        is_master_crafted: item.is_master_crafted || false,
        weapon_profiles: weaponProfiles,
        effect_names: effect_names.length > 0 ? effect_names : undefined
      };
    });

    const beastCosts = ownedBeastCosts(fighterId);

    // Calculate total cost
    let totalCost = 0;
    const isOwnedBeast = !!ownershipInfo;

    // Process vehicles with equipment and effects for display
    const processedVehicles = vehicles.map((vehicle: any) => {
      // Get THIS vehicle's equipment IDs for ammo ownership check
      const vehicleEquipmentData = vehicleEquipmentRows.filter((e: any) => e.vehicle_id === vehicle.id);
      const vehicleStandardIds = new Set(
        vehicleEquipmentData.filter((e: any) => e.equipment_id).map((e: any) => e.equipment_id)
      );
      const vehicleCustomIds = new Set(
        vehicleEquipmentData.filter((e: any) => e.custom_equipment_id).map((e: any) => e.custom_equipment_id)
      );

      // Process equipment with weapon profiles
      const vehicleEquipment = vehicleEquipmentData.map((item: any) => {
        const equipmentType = item.equipment?.equipment_type || item.custom_equipment?.equipment_type;
        let weaponProfiles: any[] = [];

        if (equipmentType === 'weapon') {
          if (item.equipment_id) {
            const baseProfiles = vehicleStandardProfilesMap.get(item.equipment_id) || [];
            const standardAmmo = (vehicleStandardAmmoByParent.get(item.equipment_id) || [])
              .filter((p: any) => vehicleStandardIds.has(p.equipment_id));
            const customAmmo = (vehicleCustomAmmoByParent.get(item.equipment_id) || [])
              .filter((p: any) => vehicleCustomIds.has(p.custom_equipment_id));
            weaponProfiles = combineProfiles(item, baseProfiles, standardAmmo, customAmmo);
          } else if (item.custom_equipment_id) {
            const baseProfiles = vehicleCustomProfilesMap.get(item.custom_equipment_id) || [];
            const customAmmo = (vehicleCustomAmmoByParent.get(item.custom_equipment_id) || [])
              .filter((p: any) => vehicleCustomIds.has(p.custom_equipment_id));
            const standardAmmo = (vehicleStandardAmmoByParent.get(item.custom_equipment_id) || [])
              .filter((p: any) => vehicleStandardIds.has(p.equipment_id));
            weaponProfiles = combineProfiles(item, baseProfiles, customAmmo, standardAmmo);
          }
        }

        return {
          vehicle_weapon_id: item.id,
          equipment_id: item.equipment_id || item.custom_equipment_id,
          custom_equipment_id: item.custom_equipment_id,
          equipment_name: item.equipment?.equipment_name || item.custom_equipment?.equipment_name || 'Unknown',
          equipment_type: equipmentType || 'unknown',
          equipment_category: item.equipment?.equipment_category || item.custom_equipment?.equipment_category || 'unknown',
          purchase_cost: item.purchase_cost || 0,
          weapon_profiles: weaponProfiles
        };
      });

      const vehicleEffects = effectsByCategory(vehicleEffectsRows.filter((e: any) => e.vehicle_id === vehicle.id));

      return {
        ...vehicle,
        equipment: vehicleEquipment,
        effects: vehicleEffects
      };
    });

    const vehicleCost = processedVehicles.reduce((sum: number, vehicle: any) => {
      let vehicleTotal = vehicle.cost || 0;
      vehicleTotal += vehicle.equipment.reduce((equipSum: number, eq: any) => equipSum + (eq.purchase_cost || 0), 0);
      vehicleTotal += effectCredits(Object.values(vehicle.effects).flat());
      return sum + vehicleTotal;
    }, 0);

    // Calculate loadout cost for display (only equipment in active loadout)
    const loadoutEquipmentCost = processedEquipment
      .filter((eq: any) => isInActiveLoadout(eq.fighter_equipment_id))
      .reduce((sum: number, eq: any) => sum + eq.purchase_cost, 0);

    if (!isOwnedBeast) {
      // Total cost for gang rating uses ALL equipment, skills and effects (not filtered by loadout)
      const allEquipmentCost = processedEquipment
        .reduce((sum: number, eq: any) => sum + eq.purchase_cost, 0);
      totalCost = fighter.credits + allEquipmentCost + skillCredits(Object.values(allSkills)) + unfilteredEffectsCost +
                  vehicleCost + (fighter.cost_adjustment || 0) + beastCosts.total;
    }

    // Separate equipment into weapons and wargear (filtered by active loadout if set)
    const weapons: WeaponProps[] = processedEquipment
      .filter((item: any) => item.equipment_type === 'weapon' && isInActiveLoadout(item.fighter_equipment_id))
      .map((item: any) => ({
        fighter_weapon_id: item.fighter_equipment_id,
        weapon_id: item.equipment_id || item.custom_equipment_id || '',
        weapon_name: item.equipment_name,
        cost: item.purchase_cost || 0,
        weapon_profiles: item.weapon_profiles || [],
        is_master_crafted: item.is_master_crafted || false,
        equipment_category: item.equipment_category || undefined,
        effect_names: item.effect_names
      }));

    const wargear: WargearItem[] = processedEquipment
      .filter((item: any) => item.equipment_type === 'wargear' && isInActiveLoadout(item.fighter_equipment_id))
      .map((item: any) => ({
        fighter_weapon_id: item.fighter_equipment_id,
        wargear_id: item.equipment_id || item.custom_equipment_id || '',
        wargear_name: item.equipment_name,
        cost: item.purchase_cost || 0,
        is_master_crafted: item.is_master_crafted || false
      }));

    // Get fighter type info from the join
    const fighterTypeInfo = fighter.fighter_types || {};
    const fighterSpecialisationInfo = fighter.fighter_specialisations || null;
    const countLimit = resolveGangCountLimit(fighterTypeInfo.count_limits, gangScope);

    // Loadout cost for fighter card display: base cost + loadout equipment + skills + effects
    const displayLoadoutCost = !isOwnedBeast
      ? fighter.credits + loadoutEquipmentCost + skillCredits(Object.values(skills)) + effectCredits(Object.values(effects).flat()) + vehicleCost + (fighter.cost_adjustment || 0) + beastCosts.total
      : 0;

    const result: GangFighter = {
      id: fighter.id,
      fighter_name: fighter.fighter_name,
      label: fighter.label,
      fighter_type: fighter.fighter_type || fighterTypeInfo.fighter_type || 'Unknown',
      fighter_type_id: fighter.fighter_type_id ?? undefined,
      custom_fighter_type_id: fighter.custom_fighter_type_id ?? null,
      min_count: countLimit.min_count,
      max_count: countLimit.max_count,
      fighter_gang_type_id: fighterTypeInfo.gang_type_id ?? fighter.custom_fighter_type?.gang_type_id ?? null,
      fighter_custom_gang_type_id: fighter.custom_fighter_type?.custom_gang_type_id ?? null,
      fighter_subtypes: fighter.fighter_subtypes || [],
      promoted_from_prospect: fighter.promoted_from_prospect,
      fighter_specialisation: fighterSpecialisationInfo ? {
        fighter_specialisation: fighterSpecialisationInfo.specialisation_name,
        fighter_specialisation_id: fighterSpecialisationInfo.id
      } : undefined,
      fighter_variant: fighter.fighter_variant ?? null,
      alliance_crew_name: fighterTypeInfo.alliance_crew_name,
      is_spyrer: fighterTypeInfo.is_spyrer ?? false,
      // The gang card needs this to offer Lasting Damage on a vehicle with no `vehicles` row
      is_vehicle: fighter.is_vehicle ?? false,
      kill_count: fighter.kill_count ?? 0,
      position: fighter.position,
      xp: fighter.xp,
      starting_xp: fighter.starting_xp,
      kills: fighter.kills || 0,
      credits: totalCost,
      loadout_cost: activeLoadoutId ? displayLoadoutCost : undefined, // Only set when loadout is active
      movement: fighter.movement,
      weapon_skill: fighter.weapon_skill,
      ballistic_skill: fighter.ballistic_skill,
      strength: fighter.strength,
      toughness: fighter.toughness,
      wounds: fighter.wounds,
      initiative: fighter.initiative,
      attacks: fighter.attacks,
      leadership: fighter.leadership,
      cool: fighter.cool,
      willpower: fighter.willpower,
      intelligence: fighter.intelligence,
      save: fighter.save ?? null,
      edition_slug: gangEditionSlug,
      weapons,
      wargear,
      effects,
      skills,
      vehicles: processedVehicles,
      cost_adjustment: fighter.cost_adjustment,
      special_rules: fighter.special_rules || [],
      note: fighter.note,
      killed: fighter.killed || false,
      starved: fighter.starved || false,
      retired: fighter.retired || false,
      enslaved: fighter.enslaved || false,
      recovery: fighter.recovery || false,
      captured: fighter.captured || false,
      free_skill: fighter.free_skill || false,
      image_url: fighter.image_url,
      captured_by_gang_name: fighter.captured_by_gang_id ? capturedByGangNameMap.get(fighter.captured_by_gang_id) : undefined,
      owner_id: ownershipInfo?.owner_id,
      owner_name: ownershipInfo?.owner_name,
      beast_equipment_stashed: ownershipInfo?.beast_equipment_stashed || false,
      active_loadout_id: activeLoadoutId || undefined,
      active_loadout_name: activeLoadoutId ? (loadoutCtx?.loadoutName ?? loadoutNameMap.get(activeLoadoutId)) : undefined,
      isActiveLoadoutForPrint: loadoutCtx?.isActiveLoadout ?? true
    };
    return { fighter: result, equipment: processedEquipment, allSkills, beastCosts };
  };
}

/**
 * The print roster's loadout contexts for one fighter: one card per loadout,
 * the active one first, or one card of all equipment when none is active.
 */
function printLoadoutContexts(fighter: any, fighterLoadouts: any[]): LoadoutContext[] {
  const activeId = fighter.active_loadout_id;
  if (fighterLoadouts.length === 0) {
    // No loadouts: show all equipment in one card
    return [{ loadoutId: null, isActiveLoadout: true }];
  }
  if (!activeId) {
    // Has loadouts but no active: emit "all equipment" (for unchecked) + per-loadout (for checked)
    return [
      { loadoutId: null, isActiveLoadout: true },
      ...fighterLoadouts.map((l: any) => ({ loadoutId: l.id, loadoutName: l.loadout_name, isActiveLoadout: false }))
    ];
  }
  return [...fighterLoadouts]
    .sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return 0;
    })
    .map((l: any) => ({ loadoutId: l.id, loadoutName: l.loadout_name, isActiveLoadout: l.id === activeId }));
}

/**
 * Assemble the gang page fighters list (GangFighter[]) from the raw bundle.
 * expandLoadoutsForPrint emits one entry per loadout for the print roster —
 * previously a separate cache entry, now an assembly-time option over the
 * same bundle.
 */
export function assembleGangFighters(
  bundle: GangFightersBundle,
  options?: GetGangFightersListOptions
): GangFighter[] {
  if (!bundle.fighters || bundle.fighters.length === 0) return [];

  const assembleFighter = fighterAssembler(bundle, options);
  const loadoutsByFighter = options?.expandLoadoutsForPrint ? groupBy(bundle.loadouts, 'fighter_id') : null;

  const results: GangFighter[] = [];
  for (const fighter of bundle.fighters) {
    try {
      const loadoutContexts = loadoutsByFighter
        ? printLoadoutContexts(fighter, loadoutsByFighter[fighter.id] || [])
        : [undefined];
      for (const loadoutCtx of loadoutContexts) {
        results.push(assembleFighter(fighter, loadoutCtx).fighter);
      }
    } catch (error) {
      console.error(`Error processing fighter ${fighter.id}:`, error);
    }
  }
  return results;
}

/**
 * Assemble the gang page's unassigned-vehicles list from the raw bundle
 * (previously getGangVehicles: 1 + 2-per-vehicle + per-weapon queries).
 */
export function assembleGangVehicles(bundle: GangFightersBundle): any[] {
  const unassigned = bundle.vehicles.filter((v: any) => !v.fighter_id);
  if (unassigned.length === 0) return [];

  const vehicleEquipmentRows = bundle.equipment.filter((e: any) => e.vehicle_id);
  const vehicleEffectsRows = bundle.effects.filter((e: any) => e.vehicle_id);

  // Custom ammo profiles can target a weapon via weapon_group_id; build the
  // group map from ALL gang equipment so group-targeted profiles owned
  // anywhere in the gang are found (mirrors the previous .or() lookup).
  const { customAmmoByParentWeapon } = buildProfileMaps(bundle.equipment);

  return unassigned.map((vehicle: any) => {
    const equipmentRows = vehicleEquipmentRows.filter((e: any) => e.vehicle_id === vehicle.id);

    const equipment = equipmentRows.map((item: any) => {
      const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
      let weaponProfiles: any[] = [];

      if (equipmentType === 'weapon') {
        if (item.equipment_id) {
          // All profiles of this weapon (nested under the equipment row)
          const profiles = [...((item.equipment?.weapon_profiles || []) as WeaponProfile[])];
          sortProfiles(profiles);
          weaponProfiles = profiles.map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }));
        } else if (item.custom_equipment_id) {
          // Own profiles + profiles targeting this weapon via weapon_group_id
          const own = ((item.custom_equipment?.custom_weapon_profiles || []) as WeaponProfile[]);
          const grouped = customAmmoByParentWeapon.get(item.custom_equipment_id) || [];
          const seen = new Set<string>();
          const profiles = [...own, ...grouped].filter((p: any) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
          sortProfiles(profiles);
          weaponProfiles = profiles.map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }));
        }
      }

      return {
        vehicle_weapon_id: item.id,
        equipment_id: item.equipment_id || item.custom_equipment_id,
        custom_equipment_id: item.custom_equipment_id,
        equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
        equipment_type: equipmentType || 'unknown',
        equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
        cost: item.purchase_cost || 0,
        weapon_profiles: weaponProfiles
      };
    });

    const effectsByCategory: Record<string, any[]> = {};
    vehicleEffectsRows
      .filter((e: any) => e.vehicle_id === vehicle.id)
      .forEach((effectData: any) => {
        const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized';
        const effectType = effectData.fighter_effect_type as { sort_order?: number | null } | null;

        if (!effectsByCategory[categoryName]) {
          effectsByCategory[categoryName] = [];
        }

        effectsByCategory[categoryName].push({
          id: effectData.id,
          effect_name: effectData.effect_name,
          fighter_equipment_id: effectData.fighter_equipment_id,
          type_specific_data: effectData.type_specific_data,
          sort_order: effectType?.sort_order ?? effectData.sort_order ?? null,
          created_at: effectData.created_at,
          updated_at: effectData.updated_at,
          fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
        });
      });

    const equipmentCost = equipment.reduce((sum: number, eq: any) => sum + (eq.cost || 0), 0);
    const effectsCost = Object.values(effectsByCategory).flat().reduce((sum: number, effect: any) => {
      return sum + (effect.type_specific_data?.credits_increase || 0);
    }, 0);

    return {
      id: vehicle.id,
      created_at: vehicle.created_at,
      vehicle_type_id: vehicle.vehicle_type_id,
      vehicle_type: vehicle.vehicle_type,
      cost: vehicle.cost,
      vehicle_name: vehicle.vehicle_name,
      movement: vehicle.movement,
      front: vehicle.front,
      side: vehicle.side,
      rear: vehicle.rear,
      hull_points: vehicle.hull_points,
      handling: vehicle.handling,
      save: vehicle.save,
      body_slots: vehicle.body_slots,
      drive_slots: vehicle.drive_slots,
      engine_slots: vehicle.engine_slots,
      body_slots_occupied: vehicle.body_slots_occupied,
      drive_slots_occupied: vehicle.drive_slots_occupied,
      engine_slots_occupied: vehicle.engine_slots_occupied,
      special_rules: vehicle.special_rules || [],
      equipment,
      total_equipment_cost: equipmentCost,
      effects: effectsByCategory,
      total_effect_credits: effectsCost
    };
  });
}

/**
 * Compact roster for the fighter page's navigation Combobox — the 13 fields it
 * reads and nothing else. A selector over the bundle the caller already holds,
 * so the fighter page no longer reads the entry a second time.
 */
export function selectGangFighterIndex(bundle: GangFightersBundle): GangFighterIndexEntry[] {
  const advancementEffectsByFighter = new Map<string, unknown[]>();
  for (const effect of bundle.effects) {
    // effects is a superset select (fighter- AND vehicle-scoped rows); skip the
    // vehicle ones, matching assembleGangFighters' fighterEffectsRows filter.
    if (!effect.fighter_id || effect.vehicle_id) continue;
    const category =
      effect.fighter_effect_type?.fighter_effect_category?.category_name;
    if (category !== 'advancements') continue;

    const list = advancementEffectsByFighter.get(effect.fighter_id);
    if (list) {
      list.push(effect);
    } else {
      advancementEffectsByFighter.set(effect.fighter_id, [effect]);
    }
  }

  const skillsByFighter = new Map<string, Record<string, { is_advance?: boolean }>>();
  for (const skill of bundle.skills) {
    if (!skill.fighter_id) continue;
    const key = skill.id ?? `${skill.fighter_id}-${skill.created_at}`;
    let existing = skillsByFighter.get(skill.fighter_id);
    if (!existing) {
      existing = {};
      skillsByFighter.set(skill.fighter_id, existing);
    }
    existing[key] = { is_advance: skill.is_advance || false };
  }

  return bundle.fighters.map((f: any) => ({
    id: f.id,
    fighter_name: f.fighter_name,
    fighter_type: f.fighter_type,
    fighter_specialisation_id: f.fighter_specialisation_id ?? null,
    promoted_from_prospect: f.promoted_from_prospect,
    xp: f.xp,
    starting_xp: f.starting_xp ?? null,
    advancements_taken: countAdvancementsTaken(
      { advancements: advancementEffectsByFighter.get(f.id) ?? [] },
      skillsByFighter.get(f.id) ?? {},
    ),
    killed: f.killed,
    retired: f.retired,
    enslaved: f.enslaved,
    starved: f.starved,
    recovery: f.recovery,
    captured: f.captured,
  }));
}

// =============================================================================
// FIGHTER PAGE VIEW - the gang page's fighter plus what only the fighter page lists
// =============================================================================

// The beast-granting item's category: 'Status Items: Exotic Beasts' in N23, 'Pets' in N26
const BEAST_EQUIPMENT_CATEGORIES = new Set(['status items: exotic beasts', 'pets']);

export interface FighterView {
  /**
   * The fighter as the gang page assembles it, with the fighter page's vehicle
   * item fields. Assembled without the gang's edition and scope, which only
   * edition_slug, min_count and max_count need.
   */
  fighter: Omit<GangFighter, 'edition_slug' | 'min_count' | 'max_count'>;
  /** Every item, in or out of the active loadout, with the fighter page's own fields. */
  equipment: any[];
  /** Every skill, in or out of the active loadout; the page mutes the ones outside it. */
  skills: Record<string, any>;
  beastCostsByEquipmentId: OwnedBeastCosts['byEquipmentId'];
  loadouts: Array<{ id: string; fighter_id: string; loadout_name: string; equipment_ids: string[] }>;
  /** The fighter_types join; null for a custom fighter type. */
  fighterType: { fighter_subtypes?: string[] | null; is_vehicle?: boolean | null; editions?: { slug: string } | null } | null;
}

/**
 * One fighter for the fighter page, from the same per-fighter assembly as the
 * gang page, or null when the bundle does not hold it.
 */
export function assembleFighterView(bundle: GangFightersBundle, fighterId: string): FighterView | null {
  const fighterRow = bundle.fighters.find((f: any) => f.id === fighterId);
  if (!fighterRow) return null;

  const { fighter, equipment, allSkills, beastCosts } = fighterAssembler(bundle)(fighterRow);

  const rowById = new Map(bundle.equipment.map((row: any) => [row.id, row]));
  const itemFields = (row: any) => ({
    is_editable: row.is_editable || false,
    is_consumable: row.equipment?.is_consumable ?? row.custom_equipment?.is_consumable ?? false,
    cost_resource: row.cost_resource ?? null,
  });

  // Equipment-to-equipment upgrades: the upgrade item -> the item it targets
  const targetBySource = new Map<string, string>();
  bundle.effects.forEach((effect: any) => {
    if (effect.fighter_equipment_id && effect.target_equipment_id) {
      targetBySource.set(effect.fighter_equipment_id, effect.target_equipment_id);
    }
  });

  const loadouts = bundle.loadouts
    .filter((l: any) => l.fighter_id === fighterId)
    .map((loadout: any) => ({
      id: loadout.id,
      fighter_id: loadout.fighter_id,
      loadout_name: loadout.loadout_name,
      equipment_ids: (loadout.fighter_loadout_equipment || []).map((a: any) => a.fighter_equipment_id) as string[]
    }));
  const loadoutIdsByItem = new Map<string, string[]>();
  loadouts.forEach((loadout) => {
    loadout.equipment_ids.forEach((itemId) => {
      loadoutIdsByItem.set(itemId, [...(loadoutIdsByItem.get(itemId) || []), loadout.id]);
    });
  });

  // Skills label the equipment they grant (fighter_skill_id)
  const skillNameById = new Map<string, string | undefined>(
    bundle.skills
      .filter((s: any) => s.fighter_id === fighterId)
      .map((s: any) => [s.id, s.skill?.name || s.custom_skill?.skill_name])
  );

  return {
    fighter: {
      ...fighter,
      vehicles: fighter.vehicles.map((vehicle: any) => ({
        ...vehicle,
        equipment: vehicle.equipment.map((item: any) => ({ ...item, ...itemFields(rowById.get(item.vehicle_weapon_id)) }))
      }))
    },
    equipment: equipment.map((item: any) => {
      const row = rowById.get(item.fighter_equipment_id);
      const beastBreakdown = BEAST_EQUIPMENT_CATEGORIES.has(item.equipment_category.toLowerCase())
        ? beastCosts.byEquipmentId[item.fighter_equipment_id]
        : undefined;
      return {
        ...item,
        ...itemFields(row),
        original_cost: row.original_cost,
        target_equipment_id: targetBySource.get(item.fighter_equipment_id) || null,
        loadout_ids: loadoutIdsByItem.get(item.fighter_equipment_id),
        fighter_skill_id: row.fighter_skill_id ?? null,
        granted_by_skill_name: row.fighter_skill_id ? skillNameById.get(row.fighter_skill_id) : undefined,
        ...(beastBreakdown
          ? { beast_equipment_cost: beastBreakdown.equipment, beast_advancements_cost: beastBreakdown.advancements }
          : {})
      };
    }),
    skills: allSkills,
    beastCostsByEquipmentId: beastCosts.byEquipmentId,
    loadouts,
    fighterType: fighterRow.fighter_types ?? null
  };
}
