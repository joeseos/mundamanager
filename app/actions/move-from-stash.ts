'use server'

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from "@/utils/auth";
import { revalidateTag } from 'next/cache';
import {
  invalidateFighterData,
  invalidateFighterVehicleData,
  invalidateFighterEquipment,
  addBeastToGangCache,
  invalidateGangStash,
  invalidateFighterAdvancement,
  invalidateVehicleData,
  CACHE_TAGS,
  invalidateUserGangsList
} from '@/utils/cache-tags';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { logEquipmentAction } from './logs/equipment-logs';
import { insertEffectWithModifiers } from './equipment';
import { countsTowardRating } from '@/utils/fighter-status';

async function invalidateBeastOwnerCache(fighterId: string, gangId: string, supabase: any) {
  const { data: ownerData } = await supabase
    .from('fighter_exotic_beasts')
    .select('fighter_owner_id')
    .eq('fighter_pet_id', fighterId)
    .single();

  if (ownerData) {
    invalidateFighterData(ownerData.fighter_owner_id, gangId);
    revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(ownerData.fighter_owner_id), { expire: 0 });
  }
}

export interface MoveFromStashItem {
  stash_id: string;
  selected_effect_ids?: string[];
  equipment_target?: { target_equipment_id: string; effect_type_id: string };
}

interface MoveFromStashParams {
  items: MoveFromStashItem[];
  fighter_id?: string;
  vehicle_id?: string;
}

export interface MoveFromStashItemResult {
  stash_id: string;
  success: boolean;
  equipment_id?: string;
  weapon_profiles?: any[];
  applied_effects?: any[];
  error?: string;
}

export interface MoveFromStashResult {
  success: boolean;
  item_results: MoveFromStashItemResult[];
  updated_gang_rating?: number;
  updated_gang_wealth?: number;
  affected_beast_ids?: string[];
  error?: string;
}

export async function moveEquipmentFromStash(params: MoveFromStashParams): Promise<MoveFromStashResult> {
  const supabase = await createClient();

  try {
    if (!params.fighter_id && !params.vehicle_id) {
      throw new Error('Either fighter_id or vehicle_id must be provided');
    }
    if (params.fighter_id && params.vehicle_id) {
      throw new Error('Cannot provide both fighter_id and vehicle_id');
    }
    if (!params.items || params.items.length === 0) {
      throw new Error('At least one item must be provided');
    }

    const user = await getAuthenticatedUser(supabase);


    // Fetch all stash items in one query
    const stashIds = params.items.map(i => i.stash_id);
    const { data: allStashData, error: stashError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        gang_id,
        equipment_id,
        custom_equipment_id,
        purchase_cost,
        is_master_crafted,
        equipment:equipment_id (equipment_category)
      `)
      .in('id', stashIds)
      .eq('gang_stash', true);

    if (stashError || !allStashData || allStashData.length === 0) {
      throw new Error('No valid stash items found');
    }

    const stashDataMap = new Map(allStashData.map(s => [s.id, s]));

    // Validate all items exist
    for (const item of params.items) {
      if (!stashDataMap.has(item.stash_id)) {
        throw new Error(`Stash item with ID ${item.stash_id} not found`);
      }
    }

    // Use first item's gang_id (all must belong to same gang)
    const gangId = allStashData[0].gang_id;
    for (const s of allStashData) {
      if (s.gang_id !== gangId) {
        throw new Error('All stash items must belong to the same gang');
      }
    }

    // Validate target belongs to same gang (once)
    let fighterOwnerId: string | null = null;

    if (params.fighter_id) {
      const { data: fighter, error: fighterError } = await supabase
        .from('fighters')
        .select('gang_id, user_id')
        .eq('id', params.fighter_id)
        .single();

      if (fighterError || !fighter) throw new Error('Fighter not found');
      if (fighter.gang_id !== gangId) throw new Error('Fighter does not belong to the same gang');
      fighterOwnerId = fighter.user_id;
    } else if (params.vehicle_id) {
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('gang_id, fighter_id')
        .eq('id', params.vehicle_id)
        .single();

      if (vehicleError || !vehicle) throw new Error('Vehicle not found');
      if (vehicle.gang_id !== gangId) throw new Error('Vehicle does not belong to the same gang');

      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('user_id')
        .eq('id', gangId)
        .single();

      if (gangError || !gang) throw new Error('Gang not found');
      fighterOwnerId = gang.user_id;
    }

    if (!fighterOwnerId) throw new Error('Could not determine equipment owner');

    // Check fighter active status (once)
    let fighterIsActive = false;
    if (params.fighter_id) {
      const { data: fighter } = await supabase
        .from('fighters')
        .select('killed, retired, enslaved, captured, fighter_class')
        .eq('id', params.fighter_id)
        .single();
      fighterIsActive = countsTowardRating(fighter);

      if (fighterIsActive && fighter?.fighter_class?.toLowerCase().startsWith('exotic beast')) {
        const { data: beastOwnership } = await supabase
          .from('fighter_exotic_beasts')
          .select('fighter_owner_id, fighters!fighter_owner_id (killed, retired, enslaved, captured)')
          .eq('fighter_pet_id', params.fighter_id)
          .maybeSingle();

        if (beastOwnership?.fighters) {
          fighterIsActive = countsTowardRating(beastOwnership.fighters as any);
        } else if (beastOwnership && !beastOwnership.fighter_owner_id) {
          fighterIsActive = false;
        }
      }
    } else if (params.vehicle_id) {
      const { data: veh } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', params.vehicle_id)
        .single();
      if (veh?.fighter_id) {
        const { data: vehicleFighter } = await supabase
          .from('fighters')
          .select('killed, retired, enslaved, captured')
          .eq('id', veh.fighter_id)
          .single();
        fighterIsActive = countsTowardRating(vehicleFighter);
      }
    }

    // Separate items into pass1 (no batch dependency) and pass2 (depends on batch item)
    const batchStashIds = new Set(stashIds);
    const pass1Items: MoveFromStashItem[] = [];
    const pass2Items: MoveFromStashItem[] = [];

    for (const item of params.items) {
      if (item.equipment_target && batchStashIds.has(item.equipment_target.target_equipment_id)) {
        pass2Items.push(item);
      } else {
        pass1Items.push(item);
      }
    }

    // Process items and collect results
    const itemResults: MoveFromStashItemResult[] = [];
    const stashIdToRealId = new Map<string, string>();
    let totalRatingDelta = 0;
    let totalEquipmentValue = 0;
    const allAffectedBeastIds: string[] = [];
    let hasAppliedEffects = false;
    let hasExoticBeastEquipment = false;

    const processItem = async (item: MoveFromStashItem): Promise<MoveFromStashItemResult> => {
      const stashData = stashDataMap.get(item.stash_id)!;
      const isCustomEquipment = !!stashData.custom_equipment_id;

      if (!stashData.equipment_id && !stashData.custom_equipment_id) {
        return { stash_id: item.stash_id, success: false, error: 'Item has neither equipment_id nor custom_equipment_id' };
      }

      // Move equipment from stash
      const { data: equipmentData, error: updateError } = await supabase
        .from('fighter_equipment')
        .update({
          fighter_id: params.fighter_id || null,
          vehicle_id: params.vehicle_id || null,
          gang_stash: false
        })
        .eq('id', item.stash_id)
        .select('id')
        .single();

      if (updateError || !equipmentData) {
        return { stash_id: item.stash_id, success: false, error: `Failed to move: ${updateError?.message || 'No data returned'}` };
      }

      // Apply equipment effects
      let appliedEffects: any[] = [];
      let effectsCreditsDelta = 0;

      if ((params.fighter_id || params.vehicle_id) && !isCustomEquipment && stashData.equipment_id) {
        try {
          const { data: equipmentEffects, error: effectsError } = await supabase
            .from('fighter_effect_types')
            .select(`
              id,
              effect_name,
              type_specific_data,
              fighter_effect_type_modifiers (
                stat_name,
                default_numeric_value,
                operation
              )
            `)
            .eq('type_specific_data->>equipment_id', stashData.equipment_id.toString());

          if (!effectsError && equipmentEffects && equipmentEffects.length > 0) {
            const fixedEffects = (equipmentEffects as any[]).filter(et => {
              const sel = et?.type_specific_data?.effect_selection;
              return sel !== 'single_select' && sel !== 'multiple_select';
            });

            let selectedEffectTypes: any[] = [];
            if (item.selected_effect_ids && item.selected_effect_ids.length > 0) {
              const { data: chosen } = await supabase
                .from('fighter_effect_types')
                .select(`
                  id,
                  effect_name,
                  type_specific_data,
                  fighter_effect_type_modifiers (
                    stat_name,
                    default_numeric_value,
                    operation
                  )
                `)
                .in('id', item.selected_effect_ids);
              selectedEffectTypes = chosen || [];
            }

            const toApplyMap = new Map<string, any>();
            [...fixedEffects, ...selectedEffectTypes].forEach(et => {
              if (et?.id && !toApplyMap.has(et.id)) toApplyMap.set(et.id, et);
            });
            const toApply = Array.from(toApplyMap.values());

            if (toApply.length > 0) {
              const effectsToInsert = toApply.map(et => ({
                fighter_id: params.fighter_id || null,
                vehicle_id: params.vehicle_id || null,
                fighter_effect_type_id: et.id,
                effect_name: et.effect_name,
                type_specific_data: et.type_specific_data,
                fighter_equipment_id: equipmentData.id,
                user_id: fighterOwnerId!
              }));

              const { data: insertedEffects, error: insertErr } = await supabase
                .from('fighter_effects')
                .insert(effectsToInsert)
                .select('id, fighter_effect_type_id');

              if (insertErr) {
                console.error(`Failed to insert effects for ${item.stash_id}: ${insertErr.message}`);
              } else if (insertedEffects && insertedEffects.length > 0) {
                const allModifiers: any[] = [];
                toApply.forEach((et, index) => {
                  const effId = insertedEffects[index].id;
                  if (et.fighter_effect_type_modifiers) {
                    et.fighter_effect_type_modifiers.forEach((mod: any) => {
                      allModifiers.push({
                        fighter_effect_id: effId,
                        stat_name: mod.stat_name,
                        numeric_value: mod.default_numeric_value,
                        operation: mod.operation || 'add'
                      });
                    });
                  }
                });

                if (allModifiers.length > 0) {
                  await supabase.from('fighter_effect_modifiers').insert(allModifiers);
                }

                const effectIdToMods = new Map<string, any[]>();
                allModifiers.forEach(m => {
                  const arr = effectIdToMods.get(m.fighter_effect_id) || [];
                  arr.push({ stat_name: m.stat_name, numeric_value: m.numeric_value, operation: m.operation });
                  effectIdToMods.set(m.fighter_effect_id, arr);
                });

                toApply.forEach((et, index) => {
                  const inserted = insertedEffects[index];
                  if (inserted) {
                    appliedEffects.push({
                      id: inserted.id,
                      effect_name: et.effect_name,
                      fighter_effect_modifiers: effectIdToMods.get(inserted.id) || []
                    });
                  }
                });

                effectsCreditsDelta += toApply.reduce((s, et) => s + (et.type_specific_data?.credits_increase || 0), 0);
              }
            }
          }
        } catch (error) {
          // Silently continue if effects fetching fails
        }
      }

      // Handle equipment-to-equipment upgrades
      if (item.equipment_target && params.fighter_id) {
        try {
          const { target_equipment_id, effect_type_id } = item.equipment_target;

          const result = await insertEffectWithModifiers(
            supabase,
            {
              fighter_id: params.fighter_id,
              vehicle_id: null,
              fighter_equipment_id: equipmentData.id,
              target_equipment_id,
              effect_type_id,
              user_id: fighterOwnerId!
            },
            { checkDuplicate: true, includeOperation: true }
          );

          if (result.success && result.effect_data) {
            const modifiers = result.effect_data.fighter_effect_type_modifiers || [];
            const modifiersWithOperation = modifiers.map((m: any) => ({
              stat_name: m.stat_name,
              numeric_value: m.default_numeric_value,
              operation: m.operation || 'add'
            }));

            appliedEffects.push({
              id: result.effect_id!,
              effect_name: result.effect_data.effect_name,
              fighter_effect_modifiers: modifiersWithOperation,
              target_equipment_id
            });
          }
        } catch (error) {
          console.error('Failed to apply equipment upgrade effect:', error);
        }
      }

      // Fetch weapon profiles
      let weaponProfiles: any[] = [];
      if (!isCustomEquipment && stashData.equipment_id) {
        const { data: profiles, error: profilesError } = await supabase
          .from('weapon_profiles')
          .select(`
            id,
            profile_name,
            range_short,
            range_long,
            acc_short,
            acc_long,
            strength,
            damage,
            ap,
            ammo,
            traits,
            weapon_id,
            created_at,
            weapon_group_id
          `)
          .eq('weapon_id', stashData.equipment_id);

        if (!profilesError && profiles) {
          weaponProfiles = profiles.map(profile => ({
            ...profile,
            is_master_crafted: stashData.is_master_crafted || false
          }));
        }
      }

      // Beast equipment cost
      let beastEquipmentCost = 0;
      let beastOwnershipData: any[] | null = null;
      const isExoticBeast = (stashData as any).equipment?.equipment_category?.toLowerCase() === 'status items: exotic beasts';

      if (params.fighter_id && !isCustomEquipment && stashData.equipment_id && isExoticBeast) {
        hasExoticBeastEquipment = true;
        const { data } = await supabase
          .from('fighter_exotic_beasts')
          .select(`
            id, fighter_pet_id,
            fighters!fighter_pet_id!inner (
              fighter_equipment!fighter_id (purchase_cost)
            )
          `)
          .eq('fighter_equipment_id', item.stash_id)
          .eq('fighters.killed', false)
          .eq('fighters.retired', false)
          .eq('fighters.enslaved', false)
          .eq('fighters.captured', false);

        beastOwnershipData = data;
        if (data && data.length > 0) {
          beastEquipmentCost = data.reduce((sum: number, beast: any) => {
            const equipCost = (beast.fighters?.fighter_equipment as any[])?.reduce(
              (s: number, eq: any) => s + (eq.purchase_cost || 0), 0
            ) || 0;
            return sum + equipCost;
          }, 0);
        }
      }

      // Accumulate financial deltas
      const itemPurchaseCost = stashData.purchase_cost || 0;
      if (fighterIsActive) {
        totalRatingDelta += itemPurchaseCost + effectsCreditsDelta + beastEquipmentCost;
      }
      totalEquipmentValue += itemPurchaseCost + effectsCreditsDelta + beastEquipmentCost;

      // Beast ownership updates
      if (params.fighter_id && !isCustomEquipment && stashData.equipment_id) {
        let ownershipData = beastOwnershipData;
        if (!ownershipData) {
          const { data } = await supabase
            .from('fighter_exotic_beasts')
            .select('id, fighter_pet_id')
            .eq('fighter_equipment_id', item.stash_id);
          ownershipData = data;
        }

        if (ownershipData && ownershipData.length > 0) {
          await supabase
            .from('fighter_exotic_beasts')
            .update({ fighter_owner_id: params.fighter_id })
            .eq('fighter_equipment_id', item.stash_id);

          ownershipData.forEach((b: any) => allAffectedBeastIds.push(b.fighter_pet_id));
        }
      }

      if (appliedEffects.length > 0) hasAppliedEffects = true;

      stashIdToRealId.set(item.stash_id, equipmentData.id);

      return {
        stash_id: item.stash_id,
        success: true,
        equipment_id: equipmentData.id,
        weapon_profiles: weaponProfiles,
        applied_effects: appliedEffects.length > 0 ? appliedEffects : undefined
      };
    }

    // Pass 1: items without batch dependencies
    for (const item of pass1Items) {
      const result = await processItem(item);
      itemResults.push(result);
    }

    // Pass 2: items that depend on batch weapons — resolve temp IDs
    for (const item of pass2Items) {
      if (item.equipment_target) {
        const realId = stashIdToRealId.get(item.equipment_target.target_equipment_id);
        if (!realId) {
          itemResults.push({
            stash_id: item.stash_id,
            success: false,
            error: 'Target weapon from batch failed to move'
          });
          continue;
        }
        item.equipment_target = {
          ...item.equipment_target,
          target_equipment_id: realId
        };
      }
      const result = await processItem(item);
      itemResults.push(result);
    }

    // Single financial update with accumulated deltas
    const financialResult = await updateGangFinancials(supabase, {
      gangId,
      ratingDelta: totalRatingDelta,
      stashValueDelta: -totalEquipmentValue
    });

    const updatedGangWealth = financialResult.newValues?.wealth;

    // Single gang rating fetch
    let updatedGangRating: number | undefined;
    try {
      const { getGangRating } = await import('@/app/lib/shared/gang-data');
      updatedGangRating = await getGangRating(gangId, supabase);
    } catch (error) {
      // Silently continue
    }

    // Single cache invalidation pass
    if (params.fighter_id) {
      invalidateFighterEquipment(params.fighter_id, gangId);
      if (hasAppliedEffects) {
        invalidateFighterAdvancement({
          fighterId: params.fighter_id,
          gangId,
          advancementType: 'effect'
        });
      }
      if (hasExoticBeastEquipment) {
        revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(params.fighter_id), { expire: 0 });
      }
      await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);
    }

    if (params.vehicle_id) {
      invalidateVehicleData(params.vehicle_id);
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', params.vehicle_id)
        .single();

      if (vehicle?.fighter_id) {
        invalidateFighterVehicleData(vehicle.fighter_id, gangId);
      }
    }

    invalidateGangStash({ gangId, userId: user.id });

    if (fighterOwnerId) {
      invalidateUserGangsList(fighterOwnerId);
    }

    if (allAffectedBeastIds.length > 0) {
      allAffectedBeastIds.forEach(beastId => {
        addBeastToGangCache(beastId, gangId);
      });
    }

    // Log batch move as a single entry
    const successItems = params.items.filter(i => itemResults.find(r => r.stash_id === i.stash_id)?.success);
    if (successItems.length > 0) {
      try {
        const equipmentNames: string[] = [];
        let totalPurchaseCost = 0;

        const standardIds = successItems.map(i => stashDataMap.get(i.stash_id)!).filter(s => s.equipment_id).map(s => s.equipment_id);
        const customIds = successItems.map(i => stashDataMap.get(i.stash_id)!).filter(s => !s.equipment_id && s.custom_equipment_id).map(s => s.custom_equipment_id);

        const nameMap = new Map<string, string>();

        if (standardIds.length > 0) {
          const { data: equipment } = await supabase
            .from('equipment')
            .select('id, equipment_name')
            .in('id', standardIds);
          equipment?.forEach(e => nameMap.set(e.id, e.equipment_name));
        }

        if (customIds.length > 0) {
          const { data: customEquipment } = await supabase
            .from('custom_equipment')
            .select('id, equipment_name')
            .in('id', customIds);
          customEquipment?.forEach(e => nameMap.set(e.id, e.equipment_name));
        }

        for (const item of successItems) {
          const stashData = stashDataMap.get(item.stash_id)!;
          const lookupId = stashData.equipment_id || stashData.custom_equipment_id;
          equipmentNames.push(nameMap.get(lookupId) || 'Unknown Equipment');
          totalPurchaseCost += stashData.purchase_cost || 0;
        }

        await logEquipmentAction({
          gang_id: gangId,
          fighter_id: params.fighter_id,
          vehicle_id: params.vehicle_id,
          equipment_name: equipmentNames.join(', '),
          purchase_cost: totalPurchaseCost,
          action_type: 'moved_from_stash',
          user_id: user.id,
          oldCredits: financialResult.oldValues?.credits,
          oldRating: financialResult.oldValues?.rating,
          oldWealth: financialResult.oldValues?.wealth,
          newCredits: financialResult.newValues?.credits,
          newRating: financialResult.newValues?.rating,
          newWealth: financialResult.newValues?.wealth
        });
      } catch (logError) {
        console.error('Failed to log equipment moved from stash:', logError);
      }
    }

    const anySuccess = itemResults.some(r => r.success);

    return {
      success: anySuccess,
      item_results: itemResults,
      updated_gang_rating: updatedGangRating,
      updated_gang_wealth: updatedGangWealth,
      ...(allAffectedBeastIds.length > 0 && { affected_beast_ids: allAffectedBeastIds })
    };

  } catch (error) {
    console.error('Error in moveEquipmentFromStash server action:', error);
    return {
      success: false,
      item_results: [],
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}
