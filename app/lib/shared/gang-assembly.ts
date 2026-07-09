import { BITTER_ENMITY_EFFECT_NAME } from '@/utils/bitterEnmityDisplay';
import { WeaponProps, WargearItem } from '@/types/fighter';
import { WeaponProfile } from '@/types/equipment';
import { applyWeaponModifiers } from '@/utils/effect-modifiers';
import type { GangFighter, GetGangFightersListOptions } from './gang-data';

/**
 * Raw, unprocessed rows for everything fighter/vehicle-shaped in a gang.
 * Fetched once (getGangFightersBundle, tag gang-{id}) and assembled into the
 * page-specific shapes by the pure functions below. The transform logic is
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
  beastsOwned: any[];
  /** fighter_exotic_beasts where the pet is in this gang (ownership info). */
  beastsPetOf: any[];
  /** ALL fighter_loadouts for the gang's fighters, with equipment assignments embedded. */
  loadouts: any[];
  /** {id, name} of gangs that captured this gang's fighters. */
  capturedByGangs: any[];
}

function groupBy<T extends Record<string, any>>(array: T[], key: string): Record<string, T[]> {
  return array.reduce((groups: Record<string, T[]>, item: T) => {
    const groupKey = item[key];
    if (groupKey != null) {
      (groups[groupKey] ||= []).push(item);
    }
    return groups;
  }, {});
}

type RawWeaponProfile = WeaponProfile & { weapon_id: string };
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
        if (!standardProfilesMap.has(p.weapon_id)) standardProfilesMap.set(p.weapon_id, []);
        standardProfilesMap.get(p.weapon_id)!.push(p);
        if (p.weapon_group_id && p.weapon_group_id !== p.weapon_id) {
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
  const expandLoadoutsForPrint = options?.expandLoadoutsForPrint ?? false;
  const fighters = bundle.fighters;
  if (!fighters || fighters.length === 0) return [];

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
  const beastsByOwner = groupBy(bundle.beastsOwned, 'fighter_owner_id');

  // Ownership info map (petId -> ownership info)
  const ownershipInfoMap = new Map();
  bundle.beastsPetOf.forEach((info: any) => {
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

  // Loadout maps: loadout_id -> Set<fighter_equipment_id>, loadout_id -> name,
  // fighter_id -> loadouts (for print expansion)
  const loadoutEquipmentMap = new Map<string, Set<string>>();
  const loadoutNameMap = new Map<string, string>();
  const loadoutsByFighter = new Map<string, any[]>();
  bundle.loadouts.forEach((loadout: any) => {
    loadoutNameMap.set(loadout.id, loadout.loadout_name);
    if (!loadoutsByFighter.has(loadout.fighter_id)) {
      loadoutsByFighter.set(loadout.fighter_id, []);
    }
    loadoutsByFighter.get(loadout.fighter_id)!.push(loadout);
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

  // Transform each fighter using pre-fetched data
  const results: any[] = [];
  for (const fighter of fighters) {
    try {
      const fighterId = fighter.id;

      // Get fighter-specific data from Maps
      const equipment = equipmentByFighter[fighterId] || [];
      const skillsData = skillsByFighter[fighterId] || [];
      const effectsData = effectsByFighter[fighterId] || [];
      const vehicles = vehiclesByFighter[fighterId] || [];
      const ownedBeasts = beastsByOwner[fighterId] || [];
      const ownershipInfo = ownershipInfoMap.get(fighter.id) || null;

      // Build list of loadout contexts to process (one for normal, multiple when expanding for print)
      type LoadoutContext = { loadoutId: string | null; loadoutName?: string; isActiveLoadout: boolean };
      const loadoutContexts: LoadoutContext[] = [];
      if (expandLoadoutsForPrint) {
        const fighterLoadouts = loadoutsByFighter.get(fighterId) || [];
        const activeId = fighter.active_loadout_id;
        if (fighterLoadouts.length === 0) {
          // No loadouts: show all equipment in one card
          loadoutContexts.push({ loadoutId: null, isActiveLoadout: true });
        } else if (!activeId) {
          // Has loadouts but no active: emit "all equipment" (for unchecked) + per-loadout (for checked)
          loadoutContexts.push({ loadoutId: null, isActiveLoadout: true });
          fighterLoadouts.forEach((l: any) => {
            loadoutContexts.push({
              loadoutId: l.id,
              loadoutName: l.loadout_name,
              isActiveLoadout: false
            });
          });
        } else {
          const sorted = [...fighterLoadouts].sort((a, b) => {
            if (a.id === activeId) return -1;
            if (b.id === activeId) return 1;
            return 0;
          });
          sorted.forEach((l) => {
            loadoutContexts.push({
              loadoutId: l.id,
              loadoutName: l.loadout_name,
              isActiveLoadout: l.id === activeId
            });
          });
        }
      } else {
        loadoutContexts.push({
          loadoutId: fighter.active_loadout_id,
          loadoutName: fighter.active_loadout_id ? loadoutNameMap.get(fighter.active_loadout_id) : undefined,
          isActiveLoadout: true
        });
      }

      for (const loadoutCtx of loadoutContexts) {
        const activeLoadoutId = loadoutCtx.loadoutId;
        const activeLoadoutEquipmentIds = activeLoadoutId
          ? loadoutEquipmentMap.get(activeLoadoutId) || new Set<string>()
          : null;

        // Process skills into the expected format
        const skills: Record<string, any> = {};
        skillsData.forEach((skillData: any) => {
          const skillName = (skillData.skill as any)?.name || (skillData.custom_skill as any)?.skill_name;
          if (skillName) {
            const fe = skillData.fighter_effect_skills?.fighter_effects;
            const injuryName = fe?.effect_name;
            const tsd =
              fe?.type_specific_data && typeof fe.type_specific_data === 'object'
                ? (fe.type_specific_data as Record<string, unknown>)
                : null;
            const isBitterEnmity = injuryName === BITTER_ENMITY_EFFECT_NAME;
            const bitterId =
              isBitterEnmity && typeof tsd?.bitter_enmity_target_gang_id === 'string'
                ? tsd.bitter_enmity_target_gang_id
                : undefined;
            const bitterName =
              isBitterEnmity && typeof tsd?.bitter_enmity_target_gang_name === 'string'
                ? tsd.bitter_enmity_target_gang_name
                : undefined;
            const bitterColour =
              isBitterEnmity && tsd && 'bitter_enmity_target_gang_colour' in tsd
                ? (tsd.bitter_enmity_target_gang_colour as string | null)
                : undefined;

            skills[skillName] = {
              id: skillData.id,
              name: skillName,
              credits_increase: skillData.credits_increase || 0,
              xp_cost: skillData.xp_cost || 0,
              is_advance: skillData.is_advance || false,
              custom_skill_id: skillData.custom_skill_id || undefined,
              fighter_injury_id: skillData.fighter_effect_skill_id || undefined,
              injury_name: injuryName || undefined,
              acquired_at: skillData.created_at,
              ...(bitterId
                ? {
                    bitter_enmity_target_gang_id: bitterId,
                    bitter_enmity_target_gang_name: bitterName,
                    bitter_enmity_target_gang_colour: bitterColour ?? null
                  }
                : {})
            };
          }
        });

        // Process effects into the expected format (grouped by category)
        const effects: Record<string, any[]> = {};
        effectsData.forEach((effectData: any) => {
          const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized';
          if (!effects[categoryName]) {
            effects[categoryName] = [];
          }
          const effectType = effectData.fighter_effect_type as { sort_order?: number | null } | null;
          effects[categoryName].push({
            id: effectData.id,
            effect_name: effectData.effect_name,
            fighter_equipment_id: effectData.fighter_equipment_id,
            type_specific_data: effectData.type_specific_data,
            sort_order: effectType?.sort_order ?? effectData.sort_order ?? null,
            created_at: effectData.created_at,
            updated_at: effectData.updated_at,
            fighter_effect_modifiers: effectData.fighter_effect_modifiers || []
          });
        });

        // Calculate unfiltered effects cost for gang rating (before filtering)
        const unfilteredEffectsCost = Object.values(effects).flat().reduce((sum: number, effect: any) => {
          return sum + (effect.type_specific_data?.credits_increase || 0);
        }, 0);

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

        // Process equipment and add weapon profiles
        const processedEquipment = equipment.map((item: any) => {
          const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
          let weaponProfiles: any[] = [];

          if (equipmentType === 'weapon') {
            if (item.equipment_id) {
              // Get base profiles for this weapon
              const baseProfiles = standardProfilesMap.get(item.equipment_id) || [];

              // Get ammo profiles ONLY if THIS fighter owns the ammo and (when loadout active) ammo is in loadout
              const standardAmmo = (standardAmmoByParentWeapon.get(item.equipment_id) || [])
                .filter((p: any) => fighterStandardIds.has(p.weapon_id) && (loadoutEquipmentIds === null || loadoutEquipmentIds.has(p.weapon_id)));
              const customAmmo = (customAmmoByParentWeapon.get(item.equipment_id) || [])
                .filter((p: any) => fighterCustomIds.has(p.custom_equipment_id) && (loadoutEquipmentIds === null || loadoutEquipmentIds.has(p.custom_equipment_id)));

              // Combine and deduplicate
              const seenIds = new Set<string>();
              weaponProfiles = [...baseProfiles, ...standardAmmo, ...customAmmo]
                .filter((p: any) => {
                  if (seenIds.has(p.id)) return false;
                  seenIds.add(p.id);
                  return true;
                })
                .map((profile: any) => ({
                  ...profile,
                  is_master_crafted: item.is_master_crafted || false
                }));
            } else if (item.custom_equipment_id) {
              // Get base profiles for this custom weapon
              const baseProfiles = customProfilesMap.get(item.custom_equipment_id) || [];

              // Get ammo profiles ONLY if THIS fighter owns the ammo and (when loadout active) ammo is in loadout
              const customAmmo = (customAmmoByParentWeapon.get(item.custom_equipment_id) || [])
                .filter((p: any) => fighterCustomIds.has(p.custom_equipment_id) && (loadoutEquipmentIds === null || loadoutEquipmentIds.has(p.custom_equipment_id)));
              const standardAmmo = (standardAmmoByParentWeapon.get(item.custom_equipment_id) || [])
                .filter((p: any) => fighterStandardIds.has(p.weapon_id) && (loadoutEquipmentIds === null || loadoutEquipmentIds.has(p.weapon_id)));

              // Combine and deduplicate
              const seenIds = new Set<string>();
              weaponProfiles = [...baseProfiles, ...customAmmo, ...standardAmmo]
                .filter((p: any) => {
                  if (seenIds.has(p.id)) return false;
                  seenIds.add(p.id);
                  return true;
                })
                .map((profile: any) => ({
                  ...profile,
                  is_master_crafted: item.is_master_crafted || false
                }));
            }
          }

          // Apply equipment-targeted effect modifiers to weapon profiles
          if (weaponProfiles.length > 0) {
            const targetingEffects = equipmentTargetingEffectsMap.get(item.id) || [];
            if (targetingEffects.length > 0) {
              weaponProfiles = applyWeaponModifiers(weaponProfiles, targetingEffects);
            }
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

        // Calculate beast costs (fighters owned by this fighter)
        const beastCosts = ownedBeasts.reduce((total: number, beastRel: any) => {
          // Find the beast fighter using O(1) lookup
          const beastFighter: any = fighterLookup.get(beastRel.fighter_pet_id);
          if (!beastFighter || beastFighter.killed || beastFighter.retired || beastFighter.enslaved || beastFighter.captured) {
            return total;
          }

          // Get beast's equipment, skills, effects
          const beastEquipment = equipmentByFighter[beastRel.fighter_pet_id] || [];
          const beastSkills = skillsByFighter[beastRel.fighter_pet_id] || [];
          const beastEffects = effectsByFighter[beastRel.fighter_pet_id] || [];

          const equipmentCost = beastEquipment.reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0);
          const skillsCost = beastSkills.reduce((sum: number, skill: any) => sum + (skill.credits_increase || 0), 0);
          const effectsCost = beastEffects.reduce((sum: number, effect: any) => {
            return sum + (effect.type_specific_data?.credits_increase || 0);
          }, 0);

          const baseBeastCost = (beastFighter.fighter_types as any)?.cost || 0;

          return total + baseBeastCost + equipmentCost + skillsCost + effectsCost + (beastFighter.cost_adjustment || 0);
        }, 0);

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
                  .filter((p: any) => vehicleStandardIds.has(p.weapon_id));
                const customAmmo = (vehicleCustomAmmoByParent.get(item.equipment_id) || [])
                  .filter((p: any) => vehicleCustomIds.has(p.custom_equipment_id));

                const seenIds = new Set<string>();
                weaponProfiles = [...baseProfiles, ...standardAmmo, ...customAmmo]
                  .filter((p: any) => {
                    if (seenIds.has(p.id)) return false;
                    seenIds.add(p.id);
                    return true;
                  })
                  .map((profile: any) => ({ ...profile, is_master_crafted: item.is_master_crafted || false }));
              } else if (item.custom_equipment_id) {
                const baseProfiles = vehicleCustomProfilesMap.get(item.custom_equipment_id) || [];
                const customAmmo = (vehicleCustomAmmoByParent.get(item.custom_equipment_id) || [])
                  .filter((p: any) => vehicleCustomIds.has(p.custom_equipment_id));
                const standardAmmo = (vehicleStandardAmmoByParent.get(item.custom_equipment_id) || [])
                  .filter((p: any) => vehicleStandardIds.has(p.weapon_id));

                const seenIds = new Set<string>();
                weaponProfiles = [...baseProfiles, ...customAmmo, ...standardAmmo]
                  .filter((p: any) => {
                    if (seenIds.has(p.id)) return false;
                    seenIds.add(p.id);
                    return true;
                  })
                  .map((profile: any) => ({ ...profile, is_master_crafted: item.is_master_crafted || false }));
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

          // Process effects grouped by category
          const vehicleEffectsData = vehicleEffectsRows.filter((e: any) => e.vehicle_id === vehicle.id);
          const vehicleEffects: Record<string, any[]> = {};
          vehicleEffectsData.forEach((effectData: any) => {
            const categoryName = effectData.fighter_effect_type?.fighter_effect_category?.category_name || 'uncategorized';
            const effectType = effectData.fighter_effect_type as { sort_order?: number | null } | null;
            if (!vehicleEffects[categoryName]) {
              vehicleEffects[categoryName] = [];
            }
            vehicleEffects[categoryName].push({
              id: effectData.id,
              fighter_equipment_id: effectData.fighter_equipment_id,
              effect_name: effectData.effect_name,
              type_specific_data: effectData.type_specific_data,
              sort_order: effectType?.sort_order ?? effectData.sort_order ?? null,
              created_at: effectData.created_at,
              updated_at: effectData.updated_at,
              fighter_effect_modifiers: effectData.fighter_effect_modifiers || []
            });
          });

          return {
            ...vehicle,
            equipment: vehicleEquipment,
            effects: vehicleEffects
          };
        });

        // Helper to check if equipment is in active loadout
        const isInActiveLoadout = (fighterEquipmentId: string) =>
          activeLoadoutEquipmentIds === null || activeLoadoutEquipmentIds.has(fighterEquipmentId);

        // Calculate loadout cost for display (only equipment in active loadout)
        const loadoutEquipmentCost = processedEquipment
          .filter((eq: any) => isInActiveLoadout(eq.fighter_equipment_id))
          .reduce((sum: number, eq: any) => sum + eq.purchase_cost, 0);

        if (!isOwnedBeast) {
          // All equipment cost - for gang rating (never filtered by loadout)
          const allEquipmentCost = processedEquipment
            .reduce((sum: number, eq: any) => sum + eq.purchase_cost, 0);
          const skillsCost = Object.values(skills).reduce((sum: number, skill: any) => sum + skill.credits_increase, 0);
          // Use unfiltered effects cost for gang rating (calculated before filtering)
          const effectsCost = unfilteredEffectsCost;

          // Calculate vehicle costs including equipment and effects
          const vehicleCost = processedVehicles.reduce((sum: number, vehicle: any) => {
            let vehicleTotal = vehicle.cost || 0;

            if (vehicle.equipment) {
              vehicleTotal += vehicle.equipment.reduce((equipSum: number, eq: any) => {
                return equipSum + (eq.purchase_cost || 0);
              }, 0);
            }

            if (vehicle.effects) {
              vehicleTotal += Object.values(vehicle.effects).flat().reduce((effectSum: number, effect: any) => {
                return effectSum + ((effect as any).type_specific_data?.credits_increase || 0);
              }, 0);
            }

            return sum + vehicleTotal;
          }, 0);

          // Total cost for gang rating uses ALL equipment (not filtered by loadout)
          totalCost = fighter.credits + allEquipmentCost + skillsCost + effectsCost + vehicleCost +
                      (fighter.cost_adjustment || 0) + beastCosts;
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
        const fighterSubTypeInfo = fighter.fighter_sub_types || null;

        // Calculate loadout cost for display: base cost + loadout equipment + skills + effects
        // This shows what the fighter costs with the current loadout
        const skillsCostForDisplay = Object.values(skills).reduce((sum: number, skill: any) => sum + skill.credits_increase, 0);
        const effectsCostForDisplay = Object.values(effects).flat().reduce((sum: number, effect: any) => {
          return sum + (effect.type_specific_data?.credits_increase || 0);
        }, 0);
        const vehicleCostForDisplay = processedVehicles.reduce((sum: number, vehicle: any) => {
          let vehicleTotal = vehicle.cost || 0;
          if (vehicle.equipment) {
            vehicleTotal += vehicle.equipment.reduce((equipSum: number, eq: any) => equipSum + (eq.purchase_cost || 0), 0);
          }
          if (vehicle.effects) {
            vehicleTotal += Object.values(vehicle.effects).flat().reduce((effectSum: number, effect: any) => {
              return effectSum + ((effect as any).type_specific_data?.credits_increase || 0);
            }, 0);
          }
          return sum + vehicleTotal;
        }, 0);

        // Loadout cost for fighter card display (only active loadout equipment)
        const displayLoadoutCost = !isOwnedBeast
          ? fighter.credits + loadoutEquipmentCost + skillsCostForDisplay + effectsCostForDisplay + vehicleCostForDisplay + (fighter.cost_adjustment || 0) + beastCosts
          : 0;

        const result = {
          id: fighter.id,
          fighter_name: fighter.fighter_name,
          label: fighter.label,
          fighter_type: fighter.fighter_type || fighterTypeInfo.fighter_type || 'Unknown',
          fighter_class: fighter.fighter_class || 'Unknown',
          fighter_sub_type: fighterSubTypeInfo ? {
            fighter_sub_type: fighterSubTypeInfo.sub_type_name,
            fighter_sub_type_id: fighterSubTypeInfo.id
          } : undefined,
          alliance_crew_name: fighterTypeInfo.alliance_crew_name,
          is_spyrer: fighterTypeInfo.is_spyrer ?? false,
          kill_count: fighter.kill_count ?? 0,
          position: fighter.position,
          xp: fighter.xp,
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
          active_loadout_name: activeLoadoutId ? (loadoutCtx.loadoutName ?? loadoutNameMap.get(activeLoadoutId)) : undefined,
          isActiveLoadoutForPrint: loadoutCtx.isActiveLoadout
        };
        results.push(result);
      }
    } catch (error) {
      console.error(`Error processing fighter ${fighter.id}:`, error);
    }
  }
  return results.filter((f: any) => f !== null);
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

// =============================================================================
// FIGHTER PAGE VIEW - assembled from the same bundle the gang page uses
// =============================================================================

const byProfileOrder = (a: any, b: any) => {
  const so = (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity);
  return so !== 0 ? so : (a.profile_name ?? '').localeCompare(b.profile_name ?? '');
};

export interface FighterView {
  equipment: any[];
  skills: Record<string, any>;
  effects: Record<string, any[]>;
  vehicles: any[];
  beastCosts: { total: number; byEquipmentId: Record<string, { equipment: number; advancements: number }> };
  ownedBeastsData: any[];
  beastFighters: any[];
  ownershipInfo: { owner_name?: string; beast_equipment_stashed: boolean } | null;
  loadouts: Array<{ id: string; fighter_id: string; loadout_name: string; equipment_ids: string[] }>;
  capturedByGangName: string | null;
  fighterTypeData: { id: string; fighter_type: string; alliance_crew_name?: string; is_spyrer?: boolean } | null;
  fighterSubTypeData: { fighter_sub_type: string; fighter_sub_type_id: string } | null;
}

/**
 * Assemble the fighter page's data slices for one fighter from the gang
 * bundle. Shapes and semantics mirror the previous per-fighter cached
 * functions (getFighterEquipment/Skills/Effects/Vehicles/Loadouts/
 * OwnedBeastsCost/OwnedBeastsData/OwnershipInfo) so the page renders
 * identically while reading the same cache entry as the gang page.
 */
export function assembleFighterView(bundle: GangFightersBundle, fighterId: string): FighterView {
  const fighterRow = bundle.fighters.find((f: any) => f.id === fighterId) || null;

  // ---- Equipment (previous getFighterEquipment semantics) ----
  const myEquipment = bundle.equipment.filter((e: any) => e.fighter_id === fighterId && !e.vehicle_id);
  const myEquipmentIds = new Set(myEquipment.map((e: any) => e.id));
  const ownedStandardIds = new Set(myEquipment.filter((e: any) => e.equipment_id).map((e: any) => e.equipment_id));

  // Target relationships (equipment-to-equipment upgrades)
  const targetEffectsMap = new Map<string, string>();
  // Effects that modify equipment profiles: targeting effects + self-effects
  const weaponEffectsMap = new Map<string, any[]>();
  bundle.effects.forEach((effect: any) => {
    if (effect.fighter_equipment_id && myEquipmentIds.has(effect.fighter_equipment_id) && effect.target_equipment_id) {
      targetEffectsMap.set(effect.fighter_equipment_id, effect.target_equipment_id);
    }
    const isTargeting = effect.target_equipment_id && myEquipmentIds.has(effect.target_equipment_id);
    const isSelf = effect.fighter_equipment_id && myEquipmentIds.has(effect.fighter_equipment_id) && !effect.target_equipment_id;
    if (!isTargeting && !isSelf) return;
    const appliesTo = effect.target_equipment_id || effect.fighter_equipment_id;
    if (!weaponEffectsMap.has(appliesTo)) weaponEffectsMap.set(appliesTo, []);
    weaponEffectsMap.get(appliesTo)!.push(effect);
  });

  // Names shown on the card come from targeting effects only
  const targetingEffectNamesMap = new Map<string, string[]>();
  weaponEffectsMap.forEach((effects, equipmentId) => {
    const targetingOnly = effects.filter((e: any) => e.target_equipment_id);
    if (targetingOnly.length === 0) return;
    const sorted = [...targetingOnly].sort((a: any, b: any) => {
      const orderA = (a.fighter_effect_type as any)?.sort_order ?? a.sort_order ?? Infinity;
      const orderB = (b.fighter_effect_type as any)?.sort_order ?? b.sort_order ?? Infinity;
      return orderA - orderB;
    });
    const names: string[] = [];
    sorted.forEach((effect: any) => {
      if (effect.effect_name && !names.includes(effect.effect_name)) names.push(effect.effect_name);
    });
    targetingEffectNamesMap.set(equipmentId, names);
  });

  // Loadout assignment map: fighter_equipment_id -> loadout_ids[]
  const myLoadouts = bundle.loadouts.filter((l: any) => l.fighter_id === fighterId);
  const loadoutAssignmentsMap = new Map<string, string[]>();
  myLoadouts.forEach((loadout: any) => {
    (loadout.fighter_loadout_equipment || []).forEach((assignment: any) => {
      if (!loadoutAssignmentsMap.has(assignment.fighter_equipment_id)) {
        loadoutAssignmentsMap.set(assignment.fighter_equipment_id, []);
      }
      loadoutAssignmentsMap.get(assignment.fighter_equipment_id)!.push(loadout.id);
    });
  });

  // Standard profile map from nested profiles of the fighter's own equipment;
  // each profile is also aliased under its weapon_group_id (grouped weapons,
  // e.g. smoke grenades) when the fighter owns the profile's weapon.
  const stdProfiles: any[] = [];
  const seenStd = new Set<string>();
  myEquipment.forEach((item: any) => {
    for (const p of (item.equipment?.weapon_profiles || [])) {
      if (!seenStd.has(p.id)) {
        seenStd.add(p.id);
        stdProfiles.push(p);
      }
    }
  });
  stdProfiles.sort(byProfileOrder);
  const standardProfilesMap = new Map<string, any[]>();
  stdProfiles.forEach((profile: any) => {
    if (!standardProfilesMap.has(profile.weapon_id)) standardProfilesMap.set(profile.weapon_id, []);
    standardProfilesMap.get(profile.weapon_id)!.push(profile);
    if (profile.weapon_group_id && ownedStandardIds.has(profile.weapon_id)) {
      if (!standardProfilesMap.has(profile.weapon_group_id)) standardProfilesMap.set(profile.weapon_group_id, []);
      standardProfilesMap.get(profile.weapon_group_id)!.push(profile);
    }
  });

  const custProfiles: any[] = [];
  const seenCust = new Set<string>();
  myEquipment.forEach((item: any) => {
    for (const p of (item.custom_equipment?.custom_weapon_profiles || [])) {
      if (!seenCust.has(p.id)) {
        seenCust.add(p.id);
        custProfiles.push(p);
      }
    }
  });
  custProfiles.sort(byProfileOrder);
  const customProfilesMap = new Map<string, any[]>();
  custProfiles.forEach((profile: any) => {
    if (!customProfilesMap.has(profile.custom_equipment_id)) customProfilesMap.set(profile.custom_equipment_id, []);
    customProfilesMap.get(profile.custom_equipment_id)!.push(profile);
  });

  const equipment = myEquipment.map((item: any) => {
    const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
    let weaponProfiles: any[] = [];

    if (equipmentType === 'weapon') {
      if (item.equipment_id) {
        weaponProfiles = (standardProfilesMap.get(item.equipment_id) || []).map((profile: any) => ({
          ...profile,
          is_master_crafted: item.is_master_crafted || false
        }));
      } else if (item.custom_equipment_id) {
        weaponProfiles = (customProfilesMap.get(item.custom_equipment_id) || []).map((profile: any) => ({
          ...profile,
          is_master_crafted: item.is_master_crafted || false
        }));
      }
    }

    if (weaponProfiles.length > 0) {
      const weaponEffects = weaponEffectsMap.get(item.id) || [];
      if (weaponEffects.length > 0) {
        weaponProfiles = applyWeaponModifiers(weaponProfiles, weaponEffects);
      }
    }

    const effectNames = targetingEffectNamesMap.get(item.id) || [];
    const loadoutIds = loadoutAssignmentsMap.get(item.id) || [];

    return {
      fighter_equipment_id: item.id,
      equipment_id: item.equipment_id || undefined,
      custom_equipment_id: item.custom_equipment_id || undefined,
      equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
      equipment_type: equipmentType || 'unknown',
      equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
      purchase_cost: item.purchase_cost || 0,
      original_cost: item.original_cost,
      is_master_crafted: item.is_master_crafted || false,
      is_editable: item.is_editable || false,
      weapon_profiles: weaponProfiles,
      target_equipment_id: targetEffectsMap.get(item.id) || null,
      effect_names: effectNames.length > 0 ? effectNames : undefined,
      loadout_ids: loadoutIds.length > 0 ? loadoutIds : undefined,
      is_consumable: (item.equipment as any)?.is_consumable ?? (item.custom_equipment as any)?.is_consumable ?? false,
      cost_resource: item.cost_resource ?? null
    };
  });

  // ---- Skills (previous getFighterSkills semantics) ----
  const skills: Record<string, any> = {};
  bundle.skills.filter((s: any) => s.fighter_id === fighterId).forEach((skillData: any) => {
    const skillName = (skillData.skill as any)?.name || (skillData.custom_skill as any)?.skill_name;
    if (skillName) {
      const fe = skillData.fighter_effect_skills?.fighter_effects;
      const injuryName = fe?.effect_name;
      const tsd =
        fe?.type_specific_data && typeof fe.type_specific_data === 'object'
          ? (fe.type_specific_data as Record<string, unknown>)
          : null;
      const isBitterEnmity = injuryName === BITTER_ENMITY_EFFECT_NAME;
      const bitterId =
        isBitterEnmity && typeof tsd?.bitter_enmity_target_gang_id === 'string'
          ? tsd.bitter_enmity_target_gang_id
          : undefined;
      const bitterName =
        isBitterEnmity && typeof tsd?.bitter_enmity_target_gang_name === 'string'
          ? tsd.bitter_enmity_target_gang_name
          : undefined;
      const bitterColour =
        isBitterEnmity && tsd && 'bitter_enmity_target_gang_colour' in tsd
          ? (tsd.bitter_enmity_target_gang_colour as string | null)
          : undefined;

      skills[skillName] = {
        id: skillData.id,
        name: skillName,
        credits_increase: skillData.credits_increase || 0,
        xp_cost: skillData.xp_cost || 0,
        is_advance: skillData.is_advance || false,
        fighter_injury_id: skillData.fighter_effect_skill_id || undefined,
        injury_name: injuryName || undefined,
        acquired_at: skillData.created_at,
        custom_skill_id: skillData.custom_skill_id || undefined,
        ...(bitterId
          ? {
              bitter_enmity_target_gang_id: bitterId,
              bitter_enmity_target_gang_name: bitterName,
              bitter_enmity_target_gang_colour: bitterColour ?? null
            }
          : {})
      };
    }
  });

  // ---- Effects (previous getFighterEffects semantics) ----
  const effects: Record<string, any[]> = {};
  bundle.effects
    .filter((e: any) => e.fighter_id === fighterId && !e.vehicle_id)
    .forEach((effectData: any) => {
      const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized';
      if (!effects[categoryName]) effects[categoryName] = [];
      const effectType = effectData.fighter_effect_type as { sort_order?: number | null } | null;
      effects[categoryName].push({
        id: effectData.id,
        effect_name: effectData.effect_name,
        type_specific_data: effectData.type_specific_data,
        sort_order: effectType?.sort_order ?? effectData.sort_order ?? null,
        created_at: effectData.created_at,
        updated_at: effectData.updated_at || undefined,
        fighter_equipment_id: effectData.fighter_equipment_id || undefined,
        fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
      });
    });

  // ---- Vehicles (previous getFighterVehicles semantics) ----
  const vehicles = bundle.vehicles
    .filter((v: any) => v.fighter_id === fighterId)
    .map((vehicle: any) => {
      const vehicleEquipmentRows = bundle.equipment.filter((e: any) => e.vehicle_id === vehicle.id);
      const vehicleStandardIds = new Set(
        vehicleEquipmentRows.filter((e: any) => e.equipment_id).map((e: any) => e.equipment_id)
      );
      const vehicleCustomIds = new Set(
        vehicleEquipmentRows.filter((e: any) => e.custom_equipment_id).map((e: any) => e.custom_equipment_id)
      );

      // Base + ammo maps from the vehicle's own equipment's nested profiles
      const vStd: any[] = [];
      const vSeenStd = new Set<string>();
      const vCust: any[] = [];
      const vSeenCust = new Set<string>();
      vehicleEquipmentRows.forEach((item: any) => {
        for (const p of (item.equipment?.weapon_profiles || [])) {
          if (!vSeenStd.has(p.id)) { vSeenStd.add(p.id); vStd.push(p); }
        }
        for (const p of (item.custom_equipment?.custom_weapon_profiles || [])) {
          if (!vSeenCust.has(p.id)) { vSeenCust.add(p.id); vCust.push(p); }
        }
      });
      vStd.sort(byProfileOrder);
      vCust.sort(byProfileOrder);

      const vStdBase = new Map<string, any[]>();
      const vStdAmmo = new Map<string, any[]>();
      vStd.forEach((profile: any) => {
        if (profile.weapon_id) {
          if (!vStdBase.has(profile.weapon_id)) vStdBase.set(profile.weapon_id, []);
          vStdBase.get(profile.weapon_id)!.push(profile);
        }
        if (profile.weapon_group_id && profile.weapon_group_id !== profile.weapon_id) {
          if (!vStdAmmo.has(profile.weapon_group_id)) vStdAmmo.set(profile.weapon_group_id, []);
          vStdAmmo.get(profile.weapon_group_id)!.push(profile);
        }
      });
      const vCustBase = new Map<string, any[]>();
      const vCustAmmo = new Map<string, any[]>();
      vCust.forEach((profile: any) => {
        if (profile.custom_equipment_id) {
          if (!vCustBase.has(profile.custom_equipment_id)) vCustBase.set(profile.custom_equipment_id, []);
          vCustBase.get(profile.custom_equipment_id)!.push(profile);
        }
        if (profile.weapon_group_id && profile.weapon_group_id !== profile.custom_equipment_id) {
          if (!vCustAmmo.has(profile.weapon_group_id)) vCustAmmo.set(profile.weapon_group_id, []);
          vCustAmmo.get(profile.weapon_group_id)!.push(profile);
        }
      });

      const processedEquipment = vehicleEquipmentRows.map((item: any) => {
        const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
        let weaponProfiles: any[] = [];

        if (equipmentType === 'weapon') {
          if (item.equipment_id) {
            const baseProfiles = vStdBase.get(item.equipment_id) || [];
            const standardAmmo = (vStdAmmo.get(item.equipment_id) || [])
              .filter((p: any) => vehicleStandardIds.has(p.weapon_id));
            const customAmmo = (vCustAmmo.get(item.equipment_id) || [])
              .filter((p: any) => vehicleCustomIds.has(p.custom_equipment_id));
            const seenIds = new Set<string>();
            weaponProfiles = [...baseProfiles, ...standardAmmo, ...customAmmo]
              .filter((p: any) => {
                if (seenIds.has(p.id)) return false;
                seenIds.add(p.id);
                return true;
              })
              .map((profile: any) => ({
                ...profile,
                is_master_crafted: item.is_master_crafted || false
              }));
          } else if (item.custom_equipment_id) {
            const baseProfiles = vCustBase.get(item.custom_equipment_id) || [];
            const customAmmo = (vCustAmmo.get(item.custom_equipment_id) || [])
              .filter((p: any) => vehicleCustomIds.has(p.custom_equipment_id));
            const standardAmmo = (vStdAmmo.get(item.custom_equipment_id) || [])
              .filter((p: any) => vehicleStandardIds.has(p.weapon_id));
            const seenIds = new Set<string>();
            weaponProfiles = [...baseProfiles, ...customAmmo, ...standardAmmo]
              .filter((p: any) => {
                if (seenIds.has(p.id)) return false;
                seenIds.add(p.id);
                return true;
              })
              .map((profile: any) => ({
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
          purchase_cost: item.purchase_cost || 0,
          is_editable: item.is_editable || false,
          weapon_profiles: weaponProfiles,
          is_consumable: (item.equipment as any)?.is_consumable ?? (item.custom_equipment as any)?.is_consumable ?? false,
          cost_resource: item.cost_resource ?? null
        };
      });

      const processedEffects: Record<string, any[]> = {};
      bundle.effects
        .filter((e: any) => e.vehicle_id === vehicle.id)
        .forEach((effectData: any) => {
          const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized';
          const effectType = effectData.fighter_effect_type as { sort_order?: number | null } | null;
          if (!processedEffects[categoryName]) processedEffects[categoryName] = [];
          processedEffects[categoryName].push({
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

      return {
        ...vehicle,
        equipment: processedEquipment,
        effects: processedEffects
      };
    });

  // ---- Owned beasts: costs + display data (previous getFighterOwnedBeastsCost/Data) ----
  const myBeastLinks = bundle.beastsOwned.filter((b: any) => b.fighter_owner_id === fighterId);
  const fighterById = new Map(bundle.fighters.map((f: any) => [f.id, f]));

  const byEquipmentId: Record<string, { equipment: number; advancements: number }> = {};
  let beastTotal = 0;
  myBeastLinks.forEach((link: any) => {
    const beast: any = fighterById.get(link.fighter_pet_id);
    if (!beast || beast.killed || beast.retired || beast.enslaved || beast.captured) return;

    const beastEquipment = bundle.equipment.filter((e: any) => e.fighter_id === beast.id && !e.vehicle_id);
    const beastSkills = bundle.skills.filter((s: any) => s.fighter_id === beast.id);
    const beastEffects = bundle.effects.filter((e: any) => e.fighter_id === beast.id && !e.vehicle_id);

    const equipmentCost = beastEquipment.reduce((s: number, eq: any) => s + (eq.purchase_cost || 0), 0);
    const skillsCost = beastSkills.reduce((s: number, skill: any) => s + (skill.credits_increase || 0), 0);
    const effectsCost = beastEffects.reduce((s: number, effect: any) => s + (effect.type_specific_data?.credits_increase || 0), 0);
    const baseBeastCost = (beast.fighter_types as any)?.cost || 0;
    const advancementsCost = skillsCost + effectsCost + (beast.cost_adjustment || 0);

    if (link.fighter_equipment_id) {
      byEquipmentId[link.fighter_equipment_id] = {
        equipment: equipmentCost,
        advancements: advancementsCost
      };
    }
    beastTotal += baseBeastCost + equipmentCost + skillsCost + effectsCost + (beast.cost_adjustment || 0);
  });

  const ownedBeastsData = myBeastLinks.map((link: any) => ({
    fighter_pet_id: link.fighter_pet_id,
    fighter_equipment_id: link.fighter_equipment_id,
    fighter_equipment: link.fighter_equipment
      ? {
          equipment: link.fighter_equipment.equipment || null,
          custom_equipment: link.fighter_equipment.custom_equipment || null
        }
      : null
  }));

  const beastFighters = myBeastLinks
    .map((link: any) => fighterById.get(link.fighter_pet_id))
    .filter(Boolean)
    .map((beast: any) => ({
      id: beast.id,
      fighter_name: beast.fighter_name,
      fighter_type: beast.fighter_type,
      fighter_class: beast.fighter_class,
      credits: beast.credits,
      created_at: beast.created_at,
      retired: beast.retired
    }));

  // ---- Ownership info (if this fighter IS a beast) ----
  const petRow = bundle.beastsPetOf.find((info: any) => info.fighter_pet_id === fighterId) || null;
  const ownershipInfo = petRow
    ? {
        owner_name: (petRow.fighters as any)?.fighter_name,
        beast_equipment_stashed: petRow.fighter_equipment?.gang_stash || false
      }
    : null;

  // ---- Loadouts (previous getFighterLoadouts shape) ----
  const loadouts = myLoadouts.map((loadout: any) => ({
    id: loadout.id,
    fighter_id: loadout.fighter_id,
    loadout_name: loadout.loadout_name,
    equipment_ids: (loadout.fighter_loadout_equipment || []).map((a: any) => a.fighter_equipment_id)
  }));

  // ---- Captured-by gang name ----
  const capturedByGangName = fighterRow?.captured_by_gang_id
    ? (bundle.capturedByGangs.find((g: any) => g.id === fighterRow.captured_by_gang_id)?.name ?? null)
    : null;

  // ---- Type / sub-type info (from the bundle's fighter row joins) ----
  const fighterTypeData = fighterRow?.fighter_type_id && fighterRow.fighter_types
    ? {
        id: fighterRow.fighter_type_id,
        fighter_type: (fighterRow.fighter_types as any).fighter_type,
        alliance_crew_name: (fighterRow.fighter_types as any).alliance_crew_name,
        is_spyrer: (fighterRow.fighter_types as any).is_spyrer
      }
    : null;

  const fighterSubTypeData = fighterRow?.fighter_sub_types
    ? {
        fighter_sub_type: (fighterRow.fighter_sub_types as any).sub_type_name,
        fighter_sub_type_id: (fighterRow.fighter_sub_types as any).id
      }
    : null;

  return {
    equipment,
    skills,
    effects,
    vehicles,
    beastCosts: { total: beastTotal, byEquipmentId },
    ownedBeastsData,
    beastFighters,
    ownershipInfo,
    loadouts,
    capturedByGangName,
    fighterTypeData,
    fighterSubTypeData
  };
}
