'use server'

import { createClient } from "@/utils/supabase/server";
import { 
  invalidateFighterDataWithFinancials, 
  invalidateVehicleData, 
  invalidateGangFinancials, 
  invalidateFighterVehicleData,
  invalidateEquipmentPurchase,
  invalidateEquipmentDeletion
} from '@/utils/cache-tags';
import { getCompleteFighterData } from '@/app/lib/fighter-details';

interface BuyEquipmentParams {
  equipment_id?: string;
  custom_equipment_id?: string;
  gang_id: string;
  fighter_id?: string;
  vehicle_id?: string;
  manual_cost?: number;
  master_crafted?: boolean;
  use_base_cost_for_rating?: boolean;
  buy_for_gang_stash?: boolean;
  selected_effect_ids?: string[];
}

interface DeleteEquipmentParams {
  fighter_equipment_id: string;
  gang_id: string;
  fighter_id: string;
  vehicle_id?: string;
}

interface EquipmentActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function buyEquipmentForFighter(params: BuyEquipmentParams): Promise<EquipmentActionResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Validate parameters
    if (!params.gang_id) {
      throw new Error('gang_id is required');
    }

    if (!params.buy_for_gang_stash && (!params.fighter_id && !params.vehicle_id)) {
      throw new Error('fighter_id or vehicle_id is required for non-stash purchases');
    }

    // Get gang info first
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, credits, gang_type_id, user_id')
      .eq('id', params.gang_id)
      .single();

    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    // Security check
    if (gang.user_id !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_role')
        .eq('id', user.id)
        .single();
      
      if (!profile || profile.user_role !== 'admin') {
        throw new Error('Not authorized to access this gang');
      }
    }

    // Get fighter type ID if needed for discounts
    let fighterTypeId: string | null = null;
    if (params.fighter_id && !params.buy_for_gang_stash) {
      const { data: fighter } = await supabase
        .from('fighters')
        .select('fighter_type_id')
        .eq('id', params.fighter_id)
        .single();
      fighterTypeId = fighter?.fighter_type_id || null;
    }

    // Get equipment details
    let equipmentDetails: any;
    let baseCost: number;
    let adjustedCost: number;
    let weaponProfiles: any[] = [];
    let customWeaponProfiles: any[] = [];

    if (params.equipment_id) {
      // Get regular equipment with weapon profiles
      const { data: equipment, error: equipError } = await supabase
        .from('equipment')
        .select(`
          id, 
          equipment_name, 
          equipment_type, 
          cost,
          weapon_profiles (
            id,
            profile_name,
            range_short,
            range_long,
            acc_short,
            acc_long,
            strength,
            ap,
            damage,
            ammo,
            traits,
            sort_order
          )
        `)
        .eq('id', params.equipment_id)
        .single();

      if (equipError || !equipment) {
        throw new Error('Equipment not found');
      }

      equipmentDetails = equipment;
      baseCost = equipment.cost;
      weaponProfiles = equipment.weapon_profiles || [];

      // Check for equipment discounts
      let discount = null;
      
      if (params.buy_for_gang_stash) {
        // For gang stash, only consider gang-level discounts
        const { data: gangDiscount } = await supabase
          .from('equipment_discounts')
          .select('adjusted_cost')
          .eq('equipment_id', params.equipment_id)
          .eq('gang_type_id', gang.gang_type_id)
          .is('fighter_type_id', null)
          .single();
        discount = gangDiscount;
      } else {
        // For fighter/vehicle purchases, check both gang and fighter type discounts
        const { data: gangDiscount } = await supabase
          .from('equipment_discounts')
          .select('adjusted_cost')
          .eq('equipment_id', params.equipment_id)
          .eq('gang_type_id', gang.gang_type_id)
          .is('fighter_type_id', null)
          .single();

        const { data: fighterDiscount } = fighterTypeId ? await supabase
          .from('equipment_discounts')
          .select('adjusted_cost')
          .eq('equipment_id', params.equipment_id)
          .eq('fighter_type_id', fighterTypeId)
          .is('gang_type_id', null)
          .single() : { data: null };

        // Use fighter discount if available, otherwise gang discount
        discount = fighterDiscount || gangDiscount;
      }

      adjustedCost = discount?.adjusted_cost || equipment.cost;
    } else if (params.custom_equipment_id) {
      // Get custom equipment with custom weapon profiles
      const { data: customEquip, error: customError } = await supabase
        .from('custom_equipment')
        .select('id, equipment_name, equipment_type, cost')
        .eq('id', params.custom_equipment_id)
        .eq('user_id', user.id)
        .single();

      if (customError || !customEquip) {
        throw new Error('Custom equipment not found');
      }

      equipmentDetails = customEquip;
      baseCost = customEquip.cost;
      adjustedCost = customEquip.cost;

      // Get custom weapon profiles if it's a weapon
      if (customEquip.equipment_type === 'weapon') {
        const { data: profiles } = await supabase
          .from('custom_weapon_profiles')
          .select(`
            id,
            profile_name,
            range_short,
            range_long,
            acc_short,
            acc_long,
            strength,
            ap,
            damage,
            ammo,
            traits,
            sort_order
          `)
          .or(`custom_equipment_id.eq.${params.custom_equipment_id},weapon_group_id.eq.${params.custom_equipment_id}`)
          .eq('user_id', user.id)
          .order('sort_order', { nullsFirst: false })
          .order('profile_name');

        customWeaponProfiles = profiles || [];
      }
    } else {
      throw new Error('Either equipment_id or custom_equipment_id is required');
    }

    // Calculate final costs
    const finalPurchaseCost = params.manual_cost ?? adjustedCost;
    let ratingCost = params.use_base_cost_for_rating ? adjustedCost : finalPurchaseCost;

    // Apply master-crafted bonus for weapons
    if (equipmentDetails.equipment_type === 'weapon' && params.master_crafted) {
      ratingCost = Math.ceil((ratingCost * 1.25) / 5) * 5;
    }

    // Check gang credits
    if (finalPurchaseCost > 0 && gang.credits < finalPurchaseCost) {
      throw new Error(`Gang has insufficient credits. Required: ${finalPurchaseCost}, Available: ${gang.credits}`);
    }

    // Insert equipment
    let newEquipmentId: string;
    
    if (params.buy_for_gang_stash) {
      const { data: stashItem, error: stashError } = await supabase
        .from('gang_stash')
        .insert({
          gang_id: params.gang_id,
          equipment_id: params.equipment_id,
          custom_equipment_id: params.custom_equipment_id,
          cost: ratingCost,
          is_master_crafted: equipmentDetails.equipment_type === 'weapon' && params.master_crafted
        })
        .select('id')
        .single();

      if (stashError) {
        throw new Error(`Failed to add to gang stash: ${stashError.message}`);
      }
      newEquipmentId = stashItem.id;
    } else {
      const { data: fighterEquip, error: equipError } = await supabase
        .from('fighter_equipment')
        .insert({
          fighter_id: params.fighter_id,
          vehicle_id: params.vehicle_id,
          equipment_id: params.equipment_id,
          custom_equipment_id: params.custom_equipment_id,
          original_cost: baseCost,
          purchase_cost: ratingCost,
          user_id: user.id,
          is_master_crafted: equipmentDetails.equipment_type === 'weapon' && params.master_crafted
        })
        .select('id')
        .single();

      if (equipError) {
        throw new Error(`Failed to add equipment: ${equipError.message}`);
      }
      newEquipmentId = fighterEquip.id;
    }

    // Update gang credits
    const { error: updateError } = await supabase
      .from('gangs')
      .update({ credits: gang.credits - finalPurchaseCost })
      .eq('id', params.gang_id);

    if (updateError) {
      throw new Error(`Failed to update gang credits: ${updateError.message}`);
    }

    // Handle fighter effects if selected
    let appliedEffects: any[] = [];
    
    if (params.selected_effect_ids && params.selected_effect_ids.length > 0 && !params.buy_for_gang_stash && !params.custom_equipment_id) {
      for (const effectId of params.selected_effect_ids) {
        try {
          // Get effect type details
          const { data: effectType } = await supabase
            .from('fighter_effect_types')
            .select(`
              id,
              effect_name,
              fighter_effect_category_id,
              fighter_effect_categories!inner (
                id,
                category_name
              )
            `)
            .eq('id', effectId)
            .single();

          if (effectType) {
            if (params.fighter_id) {
              // Call add_fighter_effect RPC
              const { data: effectResult } = await supabase.rpc('add_fighter_effect', {
                in_fighter_id: params.fighter_id,
                in_fighter_effect_category_id: effectType.fighter_effect_category_id,
                in_fighter_effect_type_id: effectType.id,
                in_user_id: user.id
              });

              if (effectResult?.id) {
                // Link effect to equipment
                await supabase
                  .from('fighter_effects')
                  .update({ fighter_equipment_id: newEquipmentId })
                  .eq('id', effectResult.id);

                // Get effect modifiers
                const { data: modifiers } = await supabase
                  .from('fighter_effect_modifiers')
                  .select('id, fighter_effect_id, stat_name, numeric_value')
                  .eq('fighter_effect_id', effectResult.id);

                appliedEffects.push({
                  id: effectResult.id,
                  effect_name: effectType.effect_name,
                  fighter_effect_type_id: effectType.id,
                  fighter_equipment_id: newEquipmentId,
                  category_name: (effectType.fighter_effect_categories as any).category_name,
                  fighter_effect_modifiers: modifiers || []
                });
              }
            } else if (params.vehicle_id) {
              // Call add_vehicle_effect RPC
              const { data: effectResult } = await supabase.rpc('add_vehicle_effect', {
                in_vehicle_id: params.vehicle_id,
                in_fighter_effect_type_id: effectType.id,
                in_user_id: user.id,
                in_fighter_effect_category_id: effectType.fighter_effect_category_id
              });

              if (effectResult?.id) {
                // Link effect to equipment
                await supabase
                  .from('fighter_effects')
                  .update({ fighter_equipment_id: newEquipmentId })
                  .eq('id', effectResult.id);

                appliedEffects.push({
                  id: effectResult.id,
                  effect_name: effectType.effect_name,
                  fighter_effect_type_id: effectType.id,
                  fighter_equipment_id: newEquipmentId,
                  category_name: (effectType.fighter_effect_categories as any).category_name
                });
              }
            }
          }
        } catch (effectError) {
          console.error('Error applying effect:', effectError);
        }
      }
    }

    // Handle beast creation for fighter equipment purchases
    let createdBeasts: any[] = [];
    
    if (params.fighter_id && !params.buy_for_gang_stash && !params.custom_equipment_id && params.equipment_id) {
      try {
        // Check if this equipment can grant exotic beasts
        const { data: beastConfigs } = await supabase
          .from('exotic_beasts')
          .select(`
            *,
            fighter_types (
              id,
              fighter_type,
              cost,
              movement,
              weapon_skill,
              ballistic_skill,
              strength,
              toughness,
              wounds,
              initiative,
              attacks,
              leadership,
              cool,
              willpower,
              intelligence
            )
          `)
          .eq('equipment_id', params.equipment_id);

        if (beastConfigs && beastConfigs.length > 0) {
          // Create beast fighters for each beast config
          for (const beastConfig of beastConfigs) {
            const fighterType = beastConfig.fighter_types;
            if (fighterType) {
              // Create the beast fighter
              const { data: newFighter, error: createError } = await supabase
                .from('fighters')
                .insert({
                  fighter_name: fighterType.fighter_type,
                  fighter_type: fighterType.fighter_type,
                  fighter_type_id: beastConfig.fighter_type_id,
                  fighter_class: 'exotic beast',
                  gang_id: params.gang_id,
                  credits: 0,
                  movement: fighterType.movement,
                  weapon_skill: fighterType.weapon_skill,
                  ballistic_skill: fighterType.ballistic_skill,
                  strength: fighterType.strength,
                  toughness: fighterType.toughness,
                  wounds: fighterType.wounds,
                  initiative: fighterType.initiative,
                  attacks: fighterType.attacks,
                  leadership: fighterType.leadership,
                  cool: fighterType.cool,
                  willpower: fighterType.willpower,
                  intelligence: fighterType.intelligence,
                  xp: 0
                })
                .select('id, fighter_name, fighter_type, fighter_class, credits, created_at')
                .single();

              if (createError || !newFighter) {
                console.error('Error creating beast fighter:', createError);
                continue;
              }

              // Add default equipment for the beast
              const { data: defaultEquipmentData } = await supabase
                .from('fighter_defaults')
                .select(`
                  equipment_id,
                  equipment:equipment_id (
                    id,
                    equipment_name,
                    equipment_type,
                    equipment_category,
                    cost
                  )
                `)
                .eq('fighter_type_id', beastConfig.fighter_type_id)
                .not('equipment_id', 'is', null);

              // Add each default equipment item
              if (defaultEquipmentData && defaultEquipmentData.length > 0) {
                for (const defaultItem of defaultEquipmentData) {
                  await supabase
                    .from('fighter_equipment')
                    .insert({
                      fighter_id: newFighter.id,
                      equipment_id: defaultItem.equipment_id,
                      purchase_cost: 0,
                      original_cost: (defaultItem.equipment as any)?.cost || 0,
                      user_id: user.id
                    });
                }
              }

              // Create ownership record
              const { data: ownershipRecord } = await supabase
                .from('fighter_exotic_beasts')
                .insert({
                  fighter_owner_id: params.fighter_id,
                  fighter_pet_id: newFighter.id,
                  fighter_equipment_id: newEquipmentId
                })
                .select('id')
                .single();

              if (ownershipRecord) {
                // Link the beast to its ownership record for cascade deletion
                await supabase
                  .from('fighters')
                  .update({ fighter_pet_id: ownershipRecord.id })
                  .eq('id', newFighter.id);

                createdBeasts.push({
                  id: newFighter.id,
                  fighter_name: newFighter.fighter_name,
                  fighter_type: newFighter.fighter_type,
                  fighter_class: newFighter.fighter_class,
                  credits: newFighter.credits,
                  equipment_source: 'Granted by equipment',
                  created_at: newFighter.created_at
                });
              }
            }
          }
        }
      } catch (beastCreationError) {
        console.error('Error in beast creation process:', beastCreationError);
      }
    }

    // Optimized cache invalidation - use granular approach
    if (params.fighter_id) {
      // Use new granular cache invalidation for fighters
      invalidateEquipmentPurchase({
        fighterId: params.fighter_id,
        gangId: params.gang_id,
        createdBeasts: createdBeasts.length > 0 ? createdBeasts : undefined
      });
    } else if (params.vehicle_id) {
      // Keep existing logic for vehicles
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', params.vehicle_id)
        .single();
      
      if (vehicleData?.fighter_id) {
        invalidateFighterDataWithFinancials(vehicleData.fighter_id, params.gang_id);
        invalidateFighterVehicleData(vehicleData.fighter_id, params.gang_id);
      }
      invalidateVehicleData(params.vehicle_id);
    } else {
      // Gang stash purchases
      invalidateGangFinancials(params.gang_id);
    }

    // Build response data to match RPC format
    let responseData: any = {};

    // Build equipment record based on type
    const equipmentRecord = {
      id: newEquipmentId,
      user_id: user.id,
      fighter_id: params.fighter_id,
      vehicle_id: params.vehicle_id,
      equipment_id: params.equipment_id,
      custom_equipment_id: params.custom_equipment_id,
      original_cost: baseCost,
      purchase_cost: ratingCost,
      is_master_crafted: equipmentDetails.equipment_type === 'weapon' && params.master_crafted
    };

    if (params.buy_for_gang_stash) {
      // Gang stash response format
      responseData = {
        updategangsCollection: {
          records: [{
            id: params.gang_id,
            credits: gang.credits - finalPurchaseCost
          }]
        },
        insertIntogang_stashCollection: {
          records: [{
            id: newEquipmentId,
            gang_id: params.gang_id,
            equipment_id: params.equipment_id,
            custom_equipment_id: params.custom_equipment_id,
            cost: ratingCost,
            is_master_crafted: equipmentDetails.equipment_type === 'weapon' && params.master_crafted,
            equipment_name: equipmentDetails.equipment_name,
            equipment_type: equipmentDetails.equipment_type
          }]
        },
        rating_cost: ratingCost
      };
    } else {
      // Fighter/vehicle equipment response format
      const newEquipment: any = {
        ...equipmentRecord,
        wargear_details: {
          name: equipmentDetails.equipment_name,
          cost: baseCost
        }
      };

      // Add weapon profiles for regular weapons
      if (equipmentDetails.equipment_type === 'weapon' && !params.custom_equipment_id && weaponProfiles.length > 0) {
        newEquipment.default_profile = weaponProfiles[0]; // First profile as default
      }

      // Add custom weapon profiles for custom weapons
      if (equipmentDetails.equipment_type === 'weapon' && params.custom_equipment_id && customWeaponProfiles.length > 0) {
        newEquipment.custom_weapon_profiles = customWeaponProfiles;
      }

      // Build collections data
      if (params.fighter_id) {
        responseData = {
          updatefightersCollection: {
            records: [{
              id: params.fighter_id,
              credits: 0 // Fighter credits are handled separately
            }]
          },
          updategangsCollection: {
            records: [{
              id: params.gang_id,
              credits: gang.credits - finalPurchaseCost
            }]
          },
          insertIntofighter_equipmentCollection: {
            records: [newEquipment]
          },
          rating_cost: ratingCost
        };
      } else if (params.vehicle_id) {
        responseData = {
          updatevehiclesCollection: {
            records: [{
              id: params.vehicle_id
            }]
          },
          updategangsCollection: {
            records: [{
              id: params.gang_id,
              credits: gang.credits - finalPurchaseCost
            }]
          },
          insertIntofighter_equipmentCollection: {
            records: [newEquipment]
          },
          rating_cost: ratingCost
        };
      }

      // Add effect information if any were applied
      if (appliedEffects.length > 0) {
        responseData.success = true;
        responseData.equipment_effect = appliedEffects[0]; // Include first effect in response
        if (params.fighter_id) {
          responseData.fighter = {
            id: params.fighter_id,
            xp: 0 // Would need to fetch actual XP if needed
          };
        }
      }
    }

    // Add beast info if created (custom addition beyond RPC)
    if (createdBeasts.length > 0) {
      responseData.created_beasts = createdBeasts;
      responseData.created_beasts_info = {
        count: createdBeasts.length,
        owner_fighter_id: params.fighter_id,
        beasts: createdBeasts
      };
    }

    return { 
      success: true, 
      data: responseData
    };
  } catch (error) {
    console.error('Error in buyEquipmentForFighter server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

export async function deleteEquipmentFromFighter(params: DeleteEquipmentParams): Promise<EquipmentActionResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get equipment details before deletion to return proper response data
    const { data: equipmentBefore, error: equipmentError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        fighter_id,
        vehicle_id,
        equipment_id,
        custom_equipment_id,
        purchase_cost,
        equipment:equipment_id (
          equipment_name,
          cost
        ),
        custom_equipment:custom_equipment_id (
          equipment_name,
          cost
        )
      `)
      .eq('id', params.fighter_equipment_id)
      .single();

    if (equipmentError || !equipmentBefore) {
      throw new Error(`Equipment with ID ${params.fighter_equipment_id} not found`);
    }

    // Get associated fighter effects before deletion (they'll be cascade deleted)
    const { data: associatedEffects } = await supabase
      .from('fighter_effects')
      .select(`
        id,
        effect_name,
        fighter_effect_modifiers (
          stat_name,
          numeric_value
        )
      `)
      .eq('fighter_equipment_id', params.fighter_equipment_id);

    // Delete the equipment (cascade will handle fighter effects automatically)
    const { error: deleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.fighter_equipment_id);

    if (deleteError) {
      throw new Error(`Failed to delete equipment: ${deleteError.message}`);
    }

    // Get fresh fighter data after deletion for accurate response
    let freshFighterData = null;
    try {
      const completeFighterData = await getCompleteFighterData(params.fighter_id);
      freshFighterData = completeFighterData;
    } catch (fighterRefreshError) {
      console.warn('Could not refresh fighter data:', fighterRefreshError);
    }

    // Calculate equipment details for response - fix TypeScript errors
    const equipmentData = equipmentBefore.equipment as any;
    const customEquipmentData = equipmentBefore.custom_equipment as any;
    
    const equipmentCost = equipmentData?.cost || 
                         customEquipmentData?.cost || 
                         equipmentBefore.purchase_cost || 0;

    const equipmentName = equipmentData?.equipment_name || 
                         customEquipmentData?.equipment_name || 
                         'Unknown Equipment';

    // Use optimized cache invalidation for equipment deletion
    // Note: We could detect deleted beast IDs here if needed for even more granular updates
    invalidateEquipmentDeletion({
      fighterId: params.fighter_id,
      gangId: params.gang_id
      // deletedBeastIds could be added here if we track which beasts were deleted
    });
    
    return { 
      success: true, 
      data: {
        deletedEquipment: {
          id: equipmentBefore.id,
          equipment_name: equipmentName,
          cost: equipmentCost,
          fighter_id: equipmentBefore.fighter_id,
          vehicle_id: equipmentBefore.vehicle_id
        },
        deletedEffects: associatedEffects || [],
        // Return fresh fighter data so frontend can update immediately without waiting for revalidation
        updatedFighter: freshFighterData?.fighter || null,
        updatedGang: freshFighterData?.gang || null,
        // Include vehicle data if this was vehicle equipment
        updatedVehicle: freshFighterData?.fighter?.vehicles?.[0] || null
      }
    };
  } catch (error) {
    console.error('Error in deleteEquipmentFromFighter server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

