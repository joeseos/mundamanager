'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { revalidateTag } from 'next/cache';
import { 
  invalidateFighterData, 
  invalidateFighterDataWithFinancials,
  invalidateFighterVehicleData,
  invalidateFighterEquipment,
  addBeastToGangCache,
  invalidateFighterOwnedBeasts,
  invalidateGangStash,
  invalidateGangRating,
  invalidateFighterAdvancement
} from '@/utils/cache-tags';
import { 
  createExoticBeastsForEquipment, 
  invalidateCacheForBeastCreation,
  type CreatedBeast 
} from '@/app/lib/exotic-beasts';
import { logEquipmentAction } from './logs/equipment-logs';
import { insertEffectWithModifiers } from './equipment';

interface MoveFromStashParams {
  stash_id: string;
  fighter_id?: string;
  vehicle_id?: string;
  selected_effect_ids?: string[];
  equipment_target?: { target_equipment_id: string; effect_type_id: string };
}

interface MoveFromStashResult {
  success: boolean;
  data?: {
    equipment_id: string;
    weapon_profiles?: any[];
    updated_gang_rating?: number;
    affected_beast_ids?: string[];
    updated_fighters?: any[];
    applied_effects?: any[];
  };
  error?: string;
}

export async function moveEquipmentFromStash(params: MoveFromStashParams): Promise<MoveFromStashResult> {
  const supabase = await createClient();
  
  try {
    // Validate input parameters
    if (!params.fighter_id && !params.vehicle_id) {
      throw new Error('Either fighter_id or vehicle_id must be provided');
    }
    
    if (params.fighter_id && params.vehicle_id) {
      throw new Error('Cannot provide both fighter_id and vehicle_id');
    }

    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);
    
    // Get the stash item data first to check permissions
    const { data: stashData, error: stashError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        gang_id,
        equipment_id,
        custom_equipment_id,
        purchase_cost,
        is_master_crafted
      `)
      .eq('id', params.stash_id)
      .eq('gang_stash', true)
      .single();

    if (stashError || !stashData) {
      throw new Error(`Stash item with ID ${params.stash_id} not found`);
    }

    // Validate that stash item has either equipment_id or custom_equipment_id
    const isCustomEquipment = !!stashData.custom_equipment_id;
    if (!stashData.equipment_id && !stashData.custom_equipment_id) {
      throw new Error('Stash item has neither equipment_id nor custom_equipment_id');
    }

    // Verify fighter/vehicle belongs to same gang as stash item
    if (params.fighter_id) {
      const { data: fighter, error: fighterError } = await supabase
        .from('fighters')
        .select('gang_id')
        .eq('id', params.fighter_id)
        .single();

      if (fighterError || !fighter) {
        throw new Error('Fighter not found');
      }

      if (fighter.gang_id !== stashData.gang_id) {
        throw new Error('Fighter does not belong to the same gang');
      }
    } else if (params.vehicle_id) {
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('gang_id, fighter_id')
        .eq('id', params.vehicle_id)
        .single();

      if (vehicleError || !vehicle) {
        throw new Error('Vehicle not found');
      }

      if (vehicle.gang_id !== stashData.gang_id) {
        throw new Error('Vehicle does not belong to the same gang');
      }
    }

    // If user is not an admin, check if they have permission for this gang
    if (!isAdmin) {
      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('user_id')
        .eq('id', stashData.gang_id)
        .single();

      if (gangError || !gang) {
        throw new Error('Gang not found');
      }
    }

    // Note: Authorization is enforced by RLS policies on fighter_equipment table

    // Update the equipment to move it from stash to fighter/vehicle
    const { data: equipmentData, error: updateError } = await supabase
      .from('fighter_equipment')
      .update({
        fighter_id: params.fighter_id || null,
        vehicle_id: params.vehicle_id || null,
        gang_stash: false
      })
      .eq('id', params.stash_id)
      .select('id')
      .single();

    if (updateError || !equipmentData) {
      throw new Error(`Failed to move equipment from stash: ${updateError?.message || 'No data returned'}`);
    }

    // Apply equipment effects if this equipment has any
    let appliedEffects: any[] = [];
    let effectsCreditsDelta = 0;
    if ((params.fighter_id || params.vehicle_id) && !isCustomEquipment && stashData.equipment_id) {
      try {
        // Get equipment effects from fighter_effect_types
        const { data: equipmentEffects, error: effectsError } = await supabase
          .from('fighter_effect_types')
          .select(`
            id,
            effect_name,
            type_specific_data,
            fighter_effect_type_modifiers (
              stat_name,
              default_numeric_value
            )
          `)
          .eq('type_specific_data->>equipment_id', stashData.equipment_id.toString());

        if (!effectsError && equipmentEffects && equipmentEffects.length > 0) {
          // 1) Fixed effects (auto-apply only)
          const fixedEffects = (equipmentEffects as any[]).filter(et => {
            const sel = et?.type_specific_data?.effect_selection;
            return sel !== 'single_select' && sel !== 'multiple_select';
          });

          // 2) Selected effects from UI (if any)
          let selectedEffectTypes: any[] = [];
          if (params.selected_effect_ids && params.selected_effect_ids.length > 0) {
            const { data: chosen } = await supabase
              .from('fighter_effect_types')
              .select(`
                id,
                effect_name,
                type_specific_data,
                fighter_effect_type_modifiers (
                  stat_name,
                  default_numeric_value
                )
              `)
              .in('id', params.selected_effect_ids);
            selectedEffectTypes = chosen || [];
          }

          // 3) Union fixed + selected; dedupe by id keeping first occurrence
          const toApplyMap = new Map<string, any>();
          [...fixedEffects, ...selectedEffectTypes].forEach(et => {
            if (et?.id && !toApplyMap.has(et.id)) toApplyMap.set(et.id, et);
          });
          const toApply = Array.from(toApplyMap.values());

          if (toApply.length > 0) {
            // Batch insert effects with fighter_equipment_id set on creation
            const effectsToInsert = toApply.map(et => ({
              fighter_id: params.fighter_id || null,
              vehicle_id: params.vehicle_id || null,
              fighter_effect_type_id: et.id,
              effect_name: et.effect_name,
              type_specific_data: et.type_specific_data,
              fighter_equipment_id: equipmentData.id,
              user_id: user.id
            }));

            const { data: insertedEffects, error: insertErr } = await supabase
              .from('fighter_effects')
              .insert(effectsToInsert)
              .select('id, fighter_effect_type_id');

            if (insertErr) {
              throw new Error(`Failed to insert effects: ${insertErr.message}`);
            }

            if (insertedEffects && insertedEffects.length > 0) {
              // Batch insert all modifiers mapped to inserted effect ids
              const allModifiers: any[] = [];
              toApply.forEach((et, index) => {
                const effId = insertedEffects[index].id;
                if (et.fighter_effect_type_modifiers) {
                  et.fighter_effect_type_modifiers.forEach((mod: any) => {
                    allModifiers.push({
                      fighter_effect_id: effId,
                      stat_name: mod.stat_name,
                      numeric_value: mod.default_numeric_value
                    });
                  });
                }
              });

              if (allModifiers.length > 0) {
                await supabase.from('fighter_effect_modifiers').insert(allModifiers);
              }

              // Build appliedEffects response and accumulate rating delta
              const effectIdToMods = new Map<string, any[]>();
              allModifiers.forEach(m => {
                const arr = effectIdToMods.get(m.fighter_effect_id) || [];
                arr.push({ stat_name: m.stat_name, numeric_value: m.numeric_value });
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

    // Handle equipment-to-equipment upgrades (weapon accessories)
    if (params.equipment_target && params.fighter_id) {
      try {
        const { target_equipment_id, effect_type_id } = params.equipment_target;

        // Use shared helper to insert effect (same logic as equipment purchase)
        const result = await insertEffectWithModifiers(
          supabase,
          {
            fighter_id: params.fighter_id,
            vehicle_id: null,
            fighter_equipment_id: equipmentData.id,
            target_equipment_id: target_equipment_id,
            effect_type_id: effect_type_id,
            user_id: user.id
          },
          { checkDuplicate: true, includeOperation: true }
        );

        if (result.success && result.effect_data) {
          // Add to appliedEffects so cache invalidation triggers
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
            target_equipment_id: target_equipment_id  // Flag to identify equipment effects
          });
        }
      } catch (error) {
        console.error('Failed to apply equipment upgrade effect:', error);
        // Continue anyway - don't block the move
      }
    }

    // Fetch weapon profiles for regular equipment (not custom equipment)
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
        // Add is_master_crafted flag to each profile
        weaponProfiles = profiles.map(profile => ({
          ...profile,
          is_master_crafted: stashData.is_master_crafted || false
        }));
      }
    }

    // Determine rating delta
    let ratingDelta = 0;
    if (params.fighter_id) {
      ratingDelta += (stashData.purchase_cost || 0);
      ratingDelta += effectsCreditsDelta;
    } else if (params.vehicle_id) {
      const { data: veh } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', params.vehicle_id)
        .single();
      if (veh?.fighter_id) {
        ratingDelta += (stashData.purchase_cost || 0);
        ratingDelta += effectsCreditsDelta;
      }
    }

    // Update rating if delta
    if (ratingDelta !== 0) {
      try {
        const { data: ratingRow } = await supabase
          .from('gangs')
          .select('rating')
          .eq('id', stashData.gang_id)
          .single();
        const currentRating = (ratingRow?.rating ?? 0) as number;
        await supabase
          .from('gangs')
          .update({ rating: Math.max(0, currentRating + ratingDelta) })
          .eq('id', stashData.gang_id);
        invalidateGangRating(stashData.gang_id);
      } catch (e) {
        console.error('Failed to update gang rating after moving from stash:', e);
      }
    }

    // Check for affected exotic beasts (equipment that was previously granting beasts)
    let affectedBeastIds: string[] = [];

    // Handle existing beast reactivation for fighter equipment moves (not custom equipment)
    if (params.fighter_id && !isCustomEquipment && stashData.equipment_id) {
      // Check if beasts already exist for this equipment and update their ownership
      const { data: existingBeastOwnership } = await supabase
        .from('fighter_exotic_beasts')
        .select('fighter_pet_id, fighter_owner_id')
        .eq('fighter_equipment_id', params.stash_id);

      if (existingBeastOwnership && existingBeastOwnership.length > 0) {
        // Beasts already exist, just update their ownership
        
        for (const ownership of existingBeastOwnership) {
          await supabase
            .from('fighter_exotic_beasts')
            .update({ fighter_owner_id: params.fighter_id })
            .eq('fighter_pet_id', ownership.fighter_pet_id)
            .eq('fighter_equipment_id', params.stash_id);
            
          affectedBeastIds.push(ownership.fighter_pet_id);
        }
        
        // Get complete beast data to return to frontend
        if (affectedBeastIds.length > 0) {
          const { getFighterBasic, getFighterEquipment, getFighterSkills, getFighterEffects, getFighterVehicles, getFighterTotalCost } = await import('@/app/lib/shared/fighter-data');
          
          const completeBeastData = [];
          for (const beastId of affectedBeastIds) {
            try {
              const [fighterBasic, equipment, skills, effects, vehicles, totalCost] = await Promise.all([
                getFighterBasic(beastId, supabase),
                getFighterEquipment(beastId, supabase),
                getFighterSkills(beastId, supabase),
                getFighterEffects(beastId, supabase),
                getFighterVehicles(beastId, supabase),
                getFighterTotalCost(beastId, supabase)
              ]);

              // Skip if beast not found
              if (!fighterBasic) {
                continue;
              }

              // Get fighter type info
              const { data: fighterTypeData } = await supabase
                .from('fighter_types')
                .select('fighter_type, alliance_crew_name')
                .eq('id', fighterBasic.fighter_type_id)
                .single();

              // Get owner name
              let ownerName: string | undefined;
              if (fighterBasic.fighter_pet_id) {
                const { data: ownershipData } = await supabase
                  .from('fighter_exotic_beasts')
                  .select(`
                    fighter_owner_id,
                    fighters!fighter_owner_id (
                      fighter_name
                    )
                  `)
                  .eq('id', fighterBasic.fighter_pet_id)
                  .single();

                if (ownershipData) {
                  ownerName = (ownershipData.fighters as any)?.fighter_name;
                }
              }

              const completeBeast = {
                id: fighterBasic.id,
                fighter_name: fighterBasic.fighter_name,
                fighter_type: fighterBasic.fighter_type || fighterTypeData?.fighter_type || 'Unknown',
                fighter_class: fighterBasic.fighter_class || 'exotic beast',
                credits: totalCost,
                beast_equipment_stashed: false, // Equipment was just moved from stash
                owner_name: ownerName,
                // Add all the required fighter properties
                movement: fighterBasic.movement,
                weapon_skill: fighterBasic.weapon_skill,
                ballistic_skill: fighterBasic.ballistic_skill,
                strength: fighterBasic.strength,
                toughness: fighterBasic.toughness,
                wounds: fighterBasic.wounds,
                initiative: fighterBasic.initiative,
                attacks: fighterBasic.attacks,
                leadership: fighterBasic.leadership,
                cool: fighterBasic.cool,
                willpower: fighterBasic.willpower,
                intelligence: fighterBasic.intelligence,
                xp: fighterBasic.xp,
                kills: fighterBasic.kills || 0,
                special_rules: fighterBasic.special_rules || [],
                // Transform equipment into weapons and wargear arrays
                weapons: equipment
                  .filter(item => item.equipment_type === 'weapon')
                  .map(weapon => ({
                    fighter_weapon_id: weapon.fighter_equipment_id,
                    weapon_id: weapon.equipment_id || weapon.custom_equipment_id || '',
                    weapon_name: weapon.equipment_name,
                    cost: weapon.purchase_cost,
                    weapon_profiles: weapon.weapon_profiles || [],
                    is_master_crafted: weapon.is_master_crafted || false
                  })),
                wargear: equipment
                  .filter(item => item.equipment_type === 'wargear')
                  .map(wargear => ({
                    fighter_weapon_id: wargear.fighter_equipment_id,
                    wargear_id: wargear.equipment_id || wargear.custom_equipment_id || '',
                    wargear_name: wargear.equipment_name,
                    cost: wargear.purchase_cost,
                    is_master_crafted: wargear.is_master_crafted || false
                  })),
                advancements: { characteristics: {}, skills: {} },
                effects,
                skills,
                vehicles: vehicles || [],
                base_stats: {
                  movement: fighterBasic.movement,
                  weapon_skill: fighterBasic.weapon_skill,
                  ballistic_skill: fighterBasic.ballistic_skill,
                  strength: fighterBasic.strength,
                  toughness: fighterBasic.toughness,
                  wounds: fighterBasic.wounds,
                  initiative: fighterBasic.initiative,
                  attacks: fighterBasic.attacks,
                  leadership: fighterBasic.leadership,
                  cool: fighterBasic.cool,
                  willpower: fighterBasic.willpower,
                  intelligence: fighterBasic.intelligence,
                },
                current_stats: {
                  movement: fighterBasic.movement,
                  weapon_skill: fighterBasic.weapon_skill,
                  ballistic_skill: fighterBasic.ballistic_skill,
                  strength: fighterBasic.strength,
                  toughness: fighterBasic.toughness,
                  wounds: fighterBasic.wounds,
                  initiative: fighterBasic.initiative,
                  attacks: fighterBasic.attacks,
                  leadership: fighterBasic.leadership,
                  cool: fighterBasic.cool,
                  willpower: fighterBasic.willpower,
                  intelligence: fighterBasic.intelligence,
                },
                killed: fighterBasic.killed || false,
                retired: fighterBasic.retired || false,
                enslaved: fighterBasic.enslaved || false,
                starved: fighterBasic.starved || false,
                recovery: fighterBasic.recovery || false,
                free_skill: fighterBasic.free_skill || false,
                image_url: fighterBasic.image_url
              };

              completeBeastData.push(completeBeast);
            } catch (error) {
              console.error(`Error fetching complete data for beast ${beastId}:`, error);
            }
          }
          
          // Add complete beast data to response
          if (completeBeastData.length > 0) {
    // Invalidate equipment caches for the fighter who received the equipment
    if (params.fighter_id) {
      invalidateFighterEquipment(params.fighter_id, stashData.gang_id);
      // If effects were applied from stash, also invalidate fighter effects
      if ((appliedEffects?.length || 0) > 0) {
        invalidateFighterAdvancement({
          fighterId: params.fighter_id,
          gangId: stashData.gang_id,
          advancementType: 'effect'
        });
      }
    }
            
            // Invalidate gang stash since equipment was moved
            invalidateGangStash({
              gangId: stashData.gang_id,
              userId: user.id
            });
            
            // Invalidate caches for affected exotic beasts (they are now visible)
            affectedBeastIds.forEach(beastId => {
              addBeastToGangCache(beastId, stashData.gang_id);
            });
            
            // Get updated gang rating AFTER all cache invalidations
            let updatedGangRating: number | undefined;
            try {
              const { getGangRating } = await import('@/app/lib/shared/gang-data');
              updatedGangRating = await getGangRating(stashData.gang_id, supabase);
            } catch (error) {
              // Silently continue if gang rating fetch fails
            }

            return {
              success: true,
              data: {
                equipment_id: equipmentData.id,
                weapon_profiles: weaponProfiles,
                updated_gang_rating: updatedGangRating,
                affected_beast_ids: affectedBeastIds,
                updated_fighters: completeBeastData,
                ...(appliedEffects.length > 0 && { applied_effects: appliedEffects })
              }
            };
          }
        }
      } else {
        // No existing beasts found for this equipment - this is expected for non-beast-granting equipment
      }
    }
    // Also check for existing beasts that were previously granted by this equipment
    if (params.fighter_id && !isCustomEquipment && stashData.equipment_id) {
      // Check if this equipment was granting any exotic beasts
      const { data: existingBeasts } = await supabase
        .from('fighter_exotic_beasts')
        .select('fighter_pet_id')
        .eq('fighter_equipment_id', params.stash_id);

      if (existingBeasts && existingBeasts.length > 0) {
        const existingBeastIds = existingBeasts.map(beast => beast.fighter_pet_id);
        // Add to affected beasts list (avoid duplicates)
        existingBeastIds.forEach(id => {
          if (!affectedBeastIds.includes(id)) {
            affectedBeastIds.push(id);
          }
        });
      }
    }

    // Invalidate caches after equipment move

    // Invalidate equipment caches for the fighter who received the equipment
    if (params.fighter_id) {
      invalidateFighterEquipment(params.fighter_id, stashData.gang_id);
      // If effects were applied from stash, also invalidate fighter effects
      if ((appliedEffects?.length || 0) > 0) {
        invalidateFighterAdvancement({
          fighterId: params.fighter_id,
          gangId: stashData.gang_id,
          advancementType: 'effect'
        });
      }
    }
    
    // Invalidate gang stash since equipment was moved
    invalidateGangStash({
      gangId: stashData.gang_id,
      userId: user.id
    });
    
    // Invalidate caches for affected exotic beasts
    if (affectedBeastIds.length > 0) {
      affectedBeastIds.forEach(beastId => {
        addBeastToGangCache(beastId, stashData.gang_id);
      });
    }

    // Log equipment moved from stash
    try {
      // Get equipment name for logging
      let equipmentName = 'Unknown Equipment';
      if (stashData.equipment_id) {
        const { data: equipment } = await supabase
          .from('equipment')
          .select('equipment_name')
          .eq('id', stashData.equipment_id)
          .single();
        if (equipment) equipmentName = equipment.equipment_name;
      } else if (stashData.custom_equipment_id) {
        const { data: customEquipment } = await supabase
          .from('custom_equipment')
          .select('equipment_name')
          .eq('id', stashData.custom_equipment_id)
          .single();
        if (customEquipment) equipmentName = customEquipment.equipment_name;
      }

      await logEquipmentAction({
        gang_id: stashData.gang_id,
        fighter_id: params.fighter_id,
        vehicle_id: params.vehicle_id,
        equipment_name: equipmentName,
        purchase_cost: stashData.purchase_cost || 0,
        action_type: 'moved_from_stash',
        user_id: user.id
      });
    } catch (logError) {
      console.error('Failed to log equipment moved from stash:', logError);
    }

    // Get updated gang rating after the equipment move (if not already calculated above)
    let updatedGangRating: number | undefined;
    try {
      const { getGangRating } = await import('@/app/lib/shared/gang-data');
      updatedGangRating = await getGangRating(stashData.gang_id, supabase);
    } catch (error) {
      // Silently continue if gang rating fetch fails
    }

    return {
      success: true,
      data: {
        equipment_id: equipmentData.id,
        weapon_profiles: weaponProfiles,
        updated_gang_rating: updatedGangRating,
        ...(affectedBeastIds.length > 0 && { affected_beast_ids: affectedBeastIds }),
        ...(appliedEffects.length > 0 && { applied_effects: appliedEffects })
      }
    };

  } catch (error) {
    console.error('Error in moveEquipmentFromStash server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}