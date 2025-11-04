'use server'

import { createClient } from "@/utils/supabase/server";
import { 
  invalidateFighterDataWithFinancials, 
  invalidateVehicleData, 
  invalidateFighterVehicleData,
  invalidateEquipmentPurchase,
  invalidateEquipmentDeletion,
  invalidateGangStash,
  invalidateGangRating,
  invalidateFighterAdvancement
} from '@/utils/cache-tags';
import { logEquipmentAction } from './logs/equipment-logs';
import { getFighterTotalCost } from '@/app/lib/shared/fighter-data';
import { getAuthenticatedUser } from '@/utils/auth';

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
  equipment_target?: { target_equipment_id: string; effect_type_id: string };
  target_equipment_id?: string; // existing purchase flow carries the chosen target
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

// Stash-specific delete params/result
interface StashDeleteParams {
  stash_id: string;
}

interface StashActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Helper function to insert a fighter effect with its modifiers
 * Consolidates effect insertion logic used across multiple code paths
 * EXPORTED for use in move-from-stash.ts to avoid duplication
 */
export async function insertEffectWithModifiers(
  supabase: any,
  params: {
    fighter_id: string | null;
    vehicle_id: string | null;
    fighter_equipment_id: string;
    target_equipment_id?: string | null;
    effect_type_id: string;
    user_id: string;
  },
  options?: {
    checkDuplicate?: boolean;
    includeOperation?: boolean;
  }
): Promise<{ success: boolean; effect_id?: string; effect_data?: any; error?: string }> {
  try {
    // Fetch effect type with modifiers
    const selectFields = options?.includeOperation
      ? `
          id,
          effect_name,
          type_specific_data,
          fighter_effect_type_modifiers (
            stat_name,
            default_numeric_value,
            operation
          )
        `
      : `
          id,
          effect_name,
          type_specific_data,
          fighter_effect_type_modifiers (
            stat_name,
            default_numeric_value
          )
        `;

    const { data: effectType, error: typeErr } = await supabase
      .from('fighter_effect_types')
      .select(selectFields)
      .eq('id', params.effect_type_id)
      .single();

    if (typeErr || !effectType) {
      return { success: false, error: 'Effect type not found' };
    }

    // Optional duplicate check
    if (options?.checkDuplicate) {
      const query = supabase
        .from('fighter_effects')
        .select('id')
        .eq('fighter_equipment_id', params.fighter_equipment_id)
        .eq('fighter_effect_type_id', params.effect_type_id)
        .limit(1);

      if (params.target_equipment_id) {
        query.eq('target_equipment_id', params.target_equipment_id);
      }

      const { data: existing } = await query;
      if ((existing?.length || 0) > 0) {
        return { success: false, error: 'Effect already exists' };
      }
    }

    // Insert effect
    const { data: newEffect, error: effectErr } = await supabase
      .from('fighter_effects')
      .insert({
        fighter_id: params.fighter_id,
        vehicle_id: params.vehicle_id,
        fighter_equipment_id: params.fighter_equipment_id,
        target_equipment_id: params.target_equipment_id || null,
        fighter_effect_type_id: effectType.id,
        effect_name: effectType.effect_name,
        type_specific_data: effectType.type_specific_data,
        user_id: params.user_id
      })
      .select('id')
      .single();

    if (effectErr || !newEffect) {
      return { success: false, error: effectErr?.message || 'Failed to create effect' };
    }

    // Insert modifiers
    if (effectType.fighter_effect_type_modifiers?.length > 0) {
      const modifiers = effectType.fighter_effect_type_modifiers.map((m: any) => ({
        fighter_effect_id: newEffect.id,
        stat_name: m.stat_name,
        numeric_value: m.default_numeric_value,
        operation: m.operation || 'add'
      }));

      const { error: modErr } = await supabase
        .from('fighter_effect_modifiers')
        .insert(modifiers);

      if (modErr) {
        return { success: false, error: modErr.message };
      }
    }

    return {
      success: true,
      effect_id: newEffect.id,
      effect_data: effectType
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function buyEquipmentForFighter(params: BuyEquipmentParams): Promise<EquipmentActionResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const user = await getAuthenticatedUser(supabase);
    

    // Validate parameters
    if (!params.gang_id) {
      throw new Error('gang_id is required');
    }

    if (!params.buy_for_gang_stash && (!params.fighter_id && !params.vehicle_id)) {
      throw new Error('fighter_id or vehicle_id is required for non-stash purchases');
    }

    // PARALLEL: Gang info and fighter/vehicle data
    // Note: Authorization is enforced by RLS policies on fighter_equipment table
    const [gangResult, fighterResult, vehicleResult] = await Promise.all([
      // Gang info
      supabase
        .from('gangs')
        .select('id, credits, gang_type_id, user_id, rating, wealth')
        .eq('id', params.gang_id)
        .single(),

      // Fighter type ID for discounts (only if needed)
      (params.fighter_id && !params.buy_for_gang_stash)
        ? supabase
            .from('fighters')
            .select('fighter_type_id')
            .eq('id', params.fighter_id)
            .single()
        : Promise.resolve({ data: null }),

      // Vehicle assignment check (only if needed)
      (params.vehicle_id && !params.buy_for_gang_stash)
        ? supabase
            .from('vehicles')
            .select('fighter_id')
            .eq('id', params.vehicle_id)
            .single()
        : Promise.resolve({ data: null })
    ]);

    const { data: gang, error: gangError } = gangResult;
    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    // Extract parallel query results
    const fighterTypeId = fighterResult.data?.fighter_type_id || null;
    const vehicleAssignedFighterId = vehicleResult.data?.fighter_id || null;

    // Get equipment details
    let equipmentDetails: any;
    let baseCost: number;
    let adjustedCost: number;
    let weaponProfiles: any[] = [];
    let customWeaponProfiles: any[] = [];

    if (params.equipment_id) {
      // Fetch Equipment details
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

      // Resolve adjusted cost using RPC (legacy-aware)
      const { data: pricedRows, error: priceErr } = await supabase.rpc(
        'get_equipment_with_discounts',
        {
          gang_type_id: gang.gang_type_id,
          equipment_category: null,
          fighter_type_id: params.buy_for_gang_stash ? null : fighterTypeId,
          fighter_type_equipment: params.buy_for_gang_stash ? null : true,
          equipment_tradingpost: null,
          fighter_id: params.buy_for_gang_stash ? null : (params.fighter_id ?? null),
          only_equipment_id: params.equipment_id
        }
      );

      if (priceErr) {
        console.warn('Price resolution via RPC failed; falling back to base cost:', priceErr);
      }

      adjustedCost = Array.isArray(pricedRows) && pricedRows[0]?.adjusted_cost != null
        ? pricedRows[0].adjusted_cost
        : equipment.cost;
    } else if (params.custom_equipment_id) {
      // PARALLEL: Custom equipment and profiles
      const [customEquipResult, profilesResult] = await Promise.all([
        // Custom equipment details
        supabase
          .from('custom_equipment')
          .select('id, equipment_name, equipment_type, cost')
          .eq('id', params.custom_equipment_id)
          .eq('user_id', user.id)
          .single(),
        
        // Custom weapon profiles (fetch even if not weapon to avoid second query)
        supabase
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
          .order('profile_name')
      ]);

      const { data: customEquip, error: customError } = customEquipResult;
      if (customError || !customEquip) {
        throw new Error('Custom equipment not found');
      }

      equipmentDetails = customEquip;
      baseCost = customEquip.cost;
      adjustedCost = customEquip.cost;

      // Only use weapon profiles if it's actually a weapon
      if (customEquip.equipment_type === 'weapon') {
        const { data: profiles } = profilesResult;
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
        .from('fighter_equipment')
        .insert({
          gang_id: params.gang_id,
          fighter_id: null,
          vehicle_id: null,
          equipment_id: params.equipment_id,
          custom_equipment_id: params.custom_equipment_id,
          original_cost: baseCost,
          purchase_cost: ratingCost,
          gang_stash: true,
          user_id: user.id,
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
          gang_id: params.gang_id,
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

    // Log equipment action
    try {
      await logEquipmentAction({
        gang_id: params.gang_id,
        fighter_id: params.fighter_id,
        vehicle_id: params.vehicle_id,
        equipment_name: equipmentDetails.equipment_name,
        purchase_cost: ratingCost,
        action_type: 'purchased',
        user_id: user.id
      });
    } catch (logError) {
      console.error('Failed to log equipment action:', logError);
    }

    // Initialize rating delta
    let ratingDelta = 0;
    if (!params.buy_for_gang_stash) {
      if (params.fighter_id) {
        ratingDelta += ratingCost;
      } else if (params.vehicle_id && vehicleAssignedFighterId) {
        ratingDelta += ratingCost;
      }
    }

    // BATCH: Handle fighter effects using helper function
    let appliedEffects: any[] = [];

    if (params.selected_effect_ids && params.selected_effect_ids.length > 0 && !params.buy_for_gang_stash && !params.custom_equipment_id) {
      try {
        // Fetch effect type metadata for rating calculation
        const { data: effectTypes } = await supabase
          .from('fighter_effect_types')
          .select(`
            id,
            effect_name,
            type_specific_data,
            fighter_effect_categories (
              id,
              category_name
            )
          `)
          .in('id', params.selected_effect_ids);

        if (effectTypes && effectTypes.length > 0) {
          // Insert each effect using helper function
          for (const effectType of effectTypes) {
            const result = await insertEffectWithModifiers(
              supabase,
              {
                fighter_id: params.fighter_id || null,
                vehicle_id: params.vehicle_id || null,
                fighter_equipment_id: newEquipmentId,
                target_equipment_id: null,
                effect_type_id: effectType.id,
                user_id: user.id
              },
              { includeOperation: true }
            );

            if (result.success && result.effect_id) {
              appliedEffects.push({
                id: result.effect_id,
                effect_name: effectType.effect_name,
                type_specific_data: effectType.type_specific_data,
                created_at: new Date().toISOString(),
                category_name: (effectType.fighter_effect_categories as any)?.category_name,
                fighter_effect_modifiers: [] // Could fetch if needed
              });

              // Rating delta calculation
              const creditsIncrease = effectType.type_specific_data?.credits_increase || 0;
              if (params.fighter_id) {
                ratingDelta += creditsIncrease;
              } else if (params.vehicle_id && vehicleAssignedFighterId) {
                ratingDelta += creditsIncrease;
              }
            }
          }
        }
      } catch (effectError) {
        console.error('Error applying effects:', effectError);
      }
    }

    // Handle beast creation for fighter equipment purchases
    let createdBeasts: any[] = [];
    let createdBeastsRatingDelta = 0;
    
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
              fighter_class_id,
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
              intelligence,
              special_rules
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
                  fighter_class: 'Exotic Beast',
                  fighter_class_id: 'bb723bee-883c-4e84-9136-be30ed195023',
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
                  special_rules: fighterType.special_rules || [],
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
                      gang_id: params.gang_id,
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

                // Increase rating by base beast cost (counted via owner semantics)
                const baseBeastCost = (fighterType.cost || 0);
                createdBeastsRatingDelta += baseBeastCost;
              }
            }
          }
        }
      } catch (beastCreationError) {
        console.error('Error in beast creation process:', beastCreationError);
      }
    }

    // PARALLEL: Rating/wealth updates and cache invalidation data fetching
    const finalOperations = [];

    // Calculate rating and wealth updates
    let newRating: number | undefined = undefined;
    let newWealth: number | undefined = undefined;

    if (ratingDelta !== 0 || createdBeastsRatingDelta !== 0) {
      // Use already-fetched gang values instead of re-querying
      const totalRatingDelta = ratingDelta + createdBeastsRatingDelta;
      const creditsDelta = -finalPurchaseCost; // Negative because credits were spent
      const wealthDelta = totalRatingDelta + creditsDelta;

      newRating = Math.max(0, (gang.rating || 0) + totalRatingDelta);
      newWealth = Math.max(0, (gang.wealth || 0) + wealthDelta);

      finalOperations.push(
        supabase
          .from('gangs')
          .update({ rating: newRating, wealth: newWealth })
          .eq('id', params.gang_id)
      );
    }

    // Vehicle fighter assignment check if needed for cache invalidation
    if (params.vehicle_id) {
      finalOperations.push(
        supabase
          .from('vehicles')
          .select('fighter_id')
          .eq('id', params.vehicle_id)
          .single()
      );
    }

    // Execute final operations in parallel
    const finalResults = await Promise.all(finalOperations);

    // Handle rating update result
    if (ratingDelta !== 0 || createdBeastsRatingDelta !== 0) {
      try {
        invalidateGangRating(params.gang_id);
      } catch (e) {
        console.error('Failed to invalidate gang rating cache:', e);
      }
    }

    // Optimized cache invalidation - use granular approach
    if (params.fighter_id) {
      // Always invalidate fighter equipment/credits/rating for a purchase on a fighter
      invalidateEquipmentPurchase({
        fighterId: params.fighter_id,
        gangId: params.gang_id,
        createdBeasts: createdBeasts.length > 0 ? createdBeasts : undefined
      });
      // If effects were applied to the fighter, also invalidate effects + derived data
      if (appliedEffects.length > 0) {
        invalidateFighterAdvancement({
          fighterId: params.fighter_id,
          gangId: params.gang_id,
          advancementType: 'effect'
        });
      }
    } else if (params.vehicle_id) {
      // Use vehicle data from parallel query if available
      const vehicleDataResult = finalOperations.length > 1 ? finalResults[1] : null;
      const vehicleData = vehicleDataResult?.data;
      
      if (vehicleData?.fighter_id) {
        invalidateFighterDataWithFinancials(vehicleData.fighter_id, params.gang_id);
        invalidateFighterVehicleData(vehicleData.fighter_id, params.gang_id);
      }
      invalidateVehicleData(params.vehicle_id);
    } else {
      // Gang stash purchases
      invalidateGangStash({
        gangId: params.gang_id,
        userId: user.id
      });
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
      // Gang stash response format (now using fighter_equipment table)
      responseData = {
        updategangsCollection: {
          records: [{
            id: params.gang_id,
            credits: gang.credits - finalPurchaseCost,
            rating: newRating,
            wealth: newWealth
          }]
        },
        insertIntofighter_equipmentCollection: {
          records: [{
            id: newEquipmentId,
            gang_id: params.gang_id,
            fighter_id: null,
            vehicle_id: null,
            equipment_id: params.equipment_id,
            custom_equipment_id: params.custom_equipment_id,
            original_cost: baseCost,
            purchase_cost: ratingCost,
            gang_stash: true,
            is_master_crafted: equipmentDetails.equipment_type === 'weapon' && params.master_crafted,
            wargear_details: {
              name: equipmentDetails.equipment_name,
              cost: baseCost
            }
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

      // If client already provided a target, apply effect now (purchase + attach in one go)
      const chosenTargetId = params.equipment_target?.target_equipment_id || params.target_equipment_id;
      const chosenEffectTypeId = params.equipment_target?.effect_type_id;

      if (
        !params.buy_for_gang_stash &&
        params.equipment_id &&
        chosenTargetId &&
        chosenEffectTypeId
      ) {
        try {
          // Insert equipment-to-equipment effect using helper function
          const result = await insertEffectWithModifiers(
            supabase,
            {
              fighter_id: params.fighter_id || null,
              vehicle_id: null,
              fighter_equipment_id: newEquipmentId,
              target_equipment_id: chosenTargetId,
              effect_type_id: chosenEffectTypeId,
              user_id: user.id
            },
            {
              checkDuplicate: true,
              includeOperation: true
            }
          );

          if (result.success && params.fighter_id) {
            // Invalidate fighter caches so modified weapon profiles re-render
            try {
              invalidateFighterDataWithFinancials(params.fighter_id, params.gang_id);
            } catch {}
          }
        } catch (e) {
          console.error('Failed to attach equipment upgrade during purchase:', e);
        }
      }

      // Note: Post-purchase upgrade detection removed - now handled pre-purchase in PurchaseModal
      // Equipment-to-equipment upgrades are detected before purchase and target is selected atomically
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
    
    // Authenticate user (RLS handles permissions)
    await getAuthenticatedUser(supabase);
    

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
        type_specific_data,
        fighter_effect_modifiers (
          stat_name,
          numeric_value
        )
      `)
      .eq('fighter_equipment_id', params.fighter_equipment_id);

    // Determine rating delta prior to deletion
    // BUT only if the fighter is active (not killed, retired, enslaved, or captured)
    // Inactive fighters are already excluded from rating calculations
    let ratingDelta = 0;
    if (equipmentBefore.fighter_id) {
      // Check if the fighter is active before applying rating delta
      const { data: fighter } = await supabase
        .from('fighters')
        .select('killed, retired, enslaved, captured')
        .eq('id', equipmentBefore.fighter_id)
        .single();

      const fighterIsActive = fighter && !fighter.killed && !fighter.retired && !fighter.enslaved && !fighter.captured;

      if (fighterIsActive) {
        ratingDelta -= (equipmentBefore.purchase_cost || 0);
        // subtract associated effects credits if any
        const effectsCredits = (associatedEffects || []).reduce((s, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0);
        ratingDelta -= effectsCredits;
      }
    } else if (equipmentBefore.vehicle_id) {
      // Only count if vehicle assigned to an active fighter
      const { data: veh } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', equipmentBefore.vehicle_id)
        .single();

      if (veh?.fighter_id) {
        // Check if the assigned fighter is active
        const { data: vehicleFighter } = await supabase
          .from('fighters')
          .select('killed, retired, enslaved, captured')
          .eq('id', veh.fighter_id)
          .single();

        const vehicleFighterIsActive = vehicleFighter && !vehicleFighter.killed && !vehicleFighter.retired && !vehicleFighter.enslaved && !vehicleFighter.captured;

        if (vehicleFighterIsActive) {
          ratingDelta -= (equipmentBefore.purchase_cost || 0);
          const effectsCredits = (associatedEffects || []).reduce((s, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0);
          ratingDelta -= effectsCredits;
        }
      }
    }

    // Delete the equipment (cascade will handle fighter effects automatically)
    const { error: deleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.fighter_equipment_id);

    if (deleteError) {
      throw new Error(`Failed to delete equipment: ${deleteError.message}`);
    }

    // Log equipment deletion
    try {
      const equipmentData = equipmentBefore.equipment as any;
      const customEquipmentData = equipmentBefore.custom_equipment as any;
      const equipmentName = equipmentData?.equipment_name || 
                           customEquipmentData?.equipment_name || 
                           'Unknown Equipment';


      await logEquipmentAction({
        gang_id: params.gang_id,
        fighter_id: equipmentBefore.fighter_id,
        vehicle_id: equipmentBefore.vehicle_id,
        equipment_name: equipmentName,
        purchase_cost: equipmentBefore.purchase_cost || 0,
        action_type: 'sold'
      });
    } catch (logError) {
      console.error('Failed to log equipment deletion:', logError);
      // Don't fail the main operation for logging errors
    }

    // Update rating and wealth if needed
    if (ratingDelta !== 0) {
      try {
        // Get current rating and wealth and update
        const { data: curr } = await supabase
          .from('gangs')
          .select('rating, wealth')
          .eq('id', params.gang_id)
          .single();
        const currentRating = (curr?.rating ?? 0) as number;
        const currentWealth = (curr?.wealth ?? 0) as number;

        // Wealth delta = rating delta (no credits change on deletion)
        const wealthDelta = ratingDelta;

        await supabase
          .from('gangs')
          .update({
            rating: Math.max(0, currentRating + ratingDelta),
            wealth: Math.max(0, currentWealth + wealthDelta)
          })
          .eq('id', params.gang_id);
        invalidateGangRating(params.gang_id);
      } catch (e) {
        console.error('Failed to update gang rating and wealth after equipment deletion:', e);
      }
    }

    // Get fresh fighter total cost after deletion for accurate response
    let freshFighterTotalCost = null;
    try {
      freshFighterTotalCost = await getFighterTotalCost(params.fighter_id, supabase);
    } catch (fighterRefreshError) {
      console.warn('Could not refresh fighter total cost:', fighterRefreshError);
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
    
    // If the deleted equipment had associated effects, invalidate fighter effects + derived data
    if ((associatedEffects?.length || 0) > 0) {
      invalidateFighterAdvancement({
        fighterId: params.fighter_id,
        gangId: params.gang_id,
        advancementType: 'effect'
      });
    }
    
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
        // Return fresh fighter total cost so frontend can update immediately without waiting for revalidation
        updatedFighterTotalCost: freshFighterTotalCost
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

export async function applyEquipmentEffect(params: {
  modifier_equipment_id: string;
  target_equipment_id: string;
  effect_type_id: string;
  fighter_id: string;
  gang_id: string;
}): Promise<EquipmentActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // 1) Validate ownership and equipment compatibility
    const { data: equipRows, error: equipErr } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        fighter_id,
        gang_id,
        equipment:equipment_id(equipment_type),
        custom_equipment:custom_equipment_id(equipment_type)
      `)
      .in('id', [params.modifier_equipment_id, params.target_equipment_id] as any);

    if (equipErr || !equipRows || equipRows.length < 2) {
      return { success: false, error: 'Equipment not found' };
    }

    const modifierRow = equipRows.find((r: any) => r.id === params.modifier_equipment_id);
    const targetRow = equipRows.find((r: any) => r.id === params.target_equipment_id);

    if (!modifierRow || !targetRow) {
      return { success: false, error: 'Equipment not found' };
    }

    if (modifierRow.fighter_id !== targetRow.fighter_id || modifierRow.fighter_id !== params.fighter_id) {
      return { success: false, error: 'Mismatched ownership' };
    }

    // 2) Fetch effect type to check if it requires weapon target
    const { data: effectType, error: typeErr } = await supabase
      .from('fighter_effect_types')
      .select(`
        id,
        fighter_effect_type_modifiers (
          stat_name
        )
      `)
      .eq('id', params.effect_type_id)
      .single();

    if (typeErr || !effectType) {
      return { success: false, error: 'Effect type not found' };
    }

    // 3) If equipment field modifiers are used, ensure target is a weapon
    const usesWeaponFields = (effectType.fighter_effect_type_modifiers || []).some((m: any) => (
      m.stat_name === 'range_short' ||
      m.stat_name === 'range_long' ||
      m.stat_name === 'acc_short' ||
      m.stat_name === 'acc_long' ||
      m.stat_name === 'strength' ||
      m.stat_name === 'ap' ||
      m.stat_name === 'damage' ||
      m.stat_name === 'ammo'
    ));

    if (usesWeaponFields) {
      const targetType = (targetRow.equipment as any)?.equipment_type || (targetRow.custom_equipment as any)?.equipment_type;
      if (targetType !== 'weapon') {
        return { success: false, error: 'Selected target is not a weapon' };
      }
    }

    // 4) Insert effect using helper function (includes duplicate check)
    const result = await insertEffectWithModifiers(
      supabase,
      {
        fighter_id: params.fighter_id,
        vehicle_id: null,
        fighter_equipment_id: params.modifier_equipment_id,
        target_equipment_id: params.target_equipment_id,
        effect_type_id: params.effect_type_id,
        user_id: user.id
      },
      {
        checkDuplicate: true,
        includeOperation: true
      }
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // 5) Invalidate caches
    try {
      invalidateFighterDataWithFinancials(params.fighter_id, params.gang_id);
    } catch {}

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Delete an item directly from the gang stash (no rating updates)
export async function deleteEquipmentFromStash(params: StashDeleteParams): Promise<StashActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: row, error: fetchErr } = await supabase
      .from('fighter_equipment')
      .select('id, gang_id, gang_stash')
      .eq('id', params.stash_id)
      .single();
    if (fetchErr || !row) return { success: false, error: 'Stash item not found' };
    if (!row.gang_stash) return { success: false, error: 'Item is not in gang stash' };

    // Permission implicitly enforced by RLS; we still fetch to invalidate correctly
    const { error: delErr } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.stash_id);
    if (delErr) return { success: false, error: delErr.message };

    invalidateGangStash({ gangId: row.gang_id, userId: user.id });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

