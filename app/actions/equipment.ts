'use server'

import { createClient } from "@/utils/supabase/server";
import {
  invalidateFighterData,
  invalidateFighterDataWithFinancials,
  invalidateVehicleData,
  invalidateFighterVehicleData,
  invalidateEquipmentPurchase,
  invalidateEquipmentDeletion,
  invalidateGangStash,
  invalidateGangRating,
  invalidateFighterAdvancement,
  CACHE_TAGS
} from '@/utils/cache-tags';
import { revalidateTag } from 'next/cache';
import { updateGangFinancials, updateGangRatingSimple } from '@/utils/gang-rating-and-wealth';
import { logEquipmentAction } from './logs/equipment-logs';
import { getFighterTotalCost } from '@/app/lib/shared/fighter-data';
import { getAuthenticatedUser } from '@/utils/auth';
import { countsTowardRating } from '@/utils/fighter-status';
import { EquipmentGrants } from '@/types/equipment';
import { createExoticBeastsForEquipment } from '@/utils/exotic-beasts';
import { clearHardpointReference } from './vehicle-hardpoints';

// Helper function to invalidate owner's cache when beast fighter is updated
async function invalidateBeastOwnerCache(fighterId: string, gangId: string, supabase: any) {
  const { data: ownerData } = await supabase
    .from('fighter_exotic_beasts')
    .select('fighter_owner_id')
    .eq('fighter_pet_id', fighterId)
    .single();

  if (ownerData) {
    invalidateFighterData(ownerData.fighter_owner_id, gangId);
    revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(ownerData.fighter_owner_id));
  }
}

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
  listed_cost?: number; // the adjusted cost as displayed in UI, includes all discounts
  selected_grant_equipment_ids?: string[]; // IDs of selected granted equipment options
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

    // PARALLEL: Gang info and vehicle data
    // Note: Authorization is enforced by RLS policies on fighter_equipment table
    const [gangResult, vehicleResult] = await Promise.all([
      // Gang info
      supabase
        .from('gangs')
        .select('id, credits, gang_type_id, user_id, rating, wealth')
        .eq('id', params.gang_id)
        .single(),

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
    const vehicleAssignedFighterId = vehicleResult.data?.fighter_id || null;

    // Get equipment details
    let equipmentDetails: any;
    let baseCost: number;
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
          is_editable,
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
    } else if (params.custom_equipment_id) {
      // PARALLEL: Custom equipment and profiles
      const [customEquipResult, profilesResult] = await Promise.all([
        // Custom equipment details
        supabase
          .from('custom_equipment')
          .select('id, equipment_name, equipment_type, cost, is_editable')
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

      // Only use weapon profiles if it's actually a weapon
      if (customEquip.equipment_type === 'weapon') {
        const { data: profiles } = profilesResult;
        customWeaponProfiles = profiles || [];
      }
    } else {
      throw new Error('Either equipment_id or custom_equipment_id is required');
    }

    // Calculate final costs
    // We trust the client's listed_cost (the adjusted price from UI) because:
    // 1. The client has already called get_equipment_with_discounts with correct gang_id
    // 2. Users can already manipulate manual_cost if desired
    // 3. Redundant server-side RPC call was removed for performance (previously missed gang_id parameter)
    const finalPurchaseCost = params.manual_cost ?? params.listed_cost ?? baseCost;
    let ratingCost = params.use_base_cost_for_rating
      ? (params.listed_cost ?? baseCost)
      : finalPurchaseCost;

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
          user_id: gang.user_id,
          is_master_crafted: equipmentDetails.equipment_type === 'weapon' && params.master_crafted,
          is_editable: equipmentDetails.is_editable || false
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
          user_id: gang.user_id,
          is_master_crafted: equipmentDetails.equipment_type === 'weapon' && params.master_crafted,
          is_editable: equipmentDetails.is_editable || false
        })
        .select('id')
        .single();

      if (equipError) {
        throw new Error(`Failed to add equipment: ${equipError.message}`);
      }
      newEquipmentId = fighterEquip.id;
    }

    // Initialize rating deltas
    let ratingDelta = 0;
    let grantsRatingDelta = 0;

    // Track granted equipment for logging after gang update
    const grantedEquipmentForLogging: Array<{ equipment_name: string; purchase_cost: number }> = [];

    // Calculate base rating delta for the main equipment purchase
    if (!params.buy_for_gang_stash) {
      if (params.fighter_id) {
        ratingDelta += ratingCost;
      } else if (params.vehicle_id && vehicleAssignedFighterId) {
        ratingDelta += ratingCost;
      }
    }

    // Handle equipment grants (equipment that automatically includes other items)
    if (params.equipment_id && !params.buy_for_gang_stash) {
      const { data: sourceEquip } = await supabase
        .from('equipment')
        .select('grants_equipment')
        .eq('id', params.equipment_id)
        .single();

      const grantsConfig = sourceEquip?.grants_equipment as EquipmentGrants | null;

      if (grantsConfig && grantsConfig.options && grantsConfig.options.length > 0) {
        // Determine which options to grant based on selection type
        let optionsToGrant = grantsConfig.options;

        if (grantsConfig.selection_type !== 'fixed') {
          // For single_select and multiple_select, filter to only selected options
          optionsToGrant = grantsConfig.options.filter(
            opt => params.selected_grant_equipment_ids?.includes(opt.equipment_id)
          );

          // Validate selection counts
          if (grantsConfig.selection_type === 'single_select' && optionsToGrant.length !== 1) {
            throw new Error('Single select requires exactly one option to be selected');
          }
          if (grantsConfig.selection_type === 'multiple_select') {
            const maxSelections = grantsConfig.max_selections || grantsConfig.options.length;
            if (optionsToGrant.length === 0) {
              throw new Error('At least one option must be selected');
            }
            if (optionsToGrant.length > maxSelections) {
              throw new Error(`Cannot select more than ${maxSelections} options`);
            }
          }
        }

        // Insert each granted equipment
        for (const option of optionsToGrant) {
          const { data: grantedEquip } = await supabase
            .from('equipment')
            .select('id, equipment_name, cost')
            .eq('id', option.equipment_id)
            .single();

          if (grantedEquip) {
            await supabase
              .from('fighter_equipment')
              .insert({
                gang_id: params.gang_id,
                fighter_id: params.fighter_id,
                vehicle_id: params.vehicle_id,
                equipment_id: grantedEquip.id,
                original_cost: grantedEquip.cost,
                purchase_cost: option.additional_cost,
                granted_by_equipment_id: newEquipmentId,
                user_id: gang.user_id
              });

            // Add to rating delta for granted equipment (fighters and assigned vehicles)
            if (params.fighter_id || (params.vehicle_id && vehicleAssignedFighterId)) {
              grantsRatingDelta += option.additional_cost;
            }

            // Track for logging after gang update
            grantedEquipmentForLogging.push({
              equipment_name: grantedEquip.equipment_name,
              purchase_cost: option.additional_cost
            });
          }
        }
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

    // Get fighter name for beast creation (if applicable)
    let fighterName: string | null = null;
    if (params.fighter_id && !params.buy_for_gang_stash && !params.custom_equipment_id && params.equipment_id) {
      const { data: fighterData } = await supabase
        .from('fighters')
        .select('fighter_name')
        .eq('id', params.fighter_id)
        .single();
      fighterName = fighterData?.fighter_name || null;
    }

    // Handle beast creation for fighter equipment purchases
    let createdBeasts: any[] = [];
    let createdBeastsRatingDelta = 0;

    if (params.fighter_id && !params.buy_for_gang_stash && !params.custom_equipment_id && params.equipment_id && fighterName) {
      try {
        const beastResult = await createExoticBeastsForEquipment({
          equipmentId: params.equipment_id,
          ownerFighterId: params.fighter_id,
          ownerFighterName: fighterName,
          gangId: params.gang_id,
          userId: gang.user_id,
          fighterEquipmentId: newEquipmentId
        });

        if (beastResult.success && beastResult.createdBeasts.length > 0) {
          createdBeasts = beastResult.createdBeasts;

          // Calculate rating delta from beast costs
          createdBeastsRatingDelta = createdBeasts.reduce(
            (sum, beast) => sum + (beast.credits || 0),
            0
          );
        }
      } catch (beastCreationError) {
        console.error('Error in beast creation process:', beastCreationError);
      }
    }

    // Handle beast creation for STASH equipment purchases
    if (params.buy_for_gang_stash && !params.custom_equipment_id && params.equipment_id) {
      try {
        const beastResult = await createExoticBeastsForEquipment({
          equipmentId: params.equipment_id,
          ownerFighterId: null,  // No owner for stash
          ownerFighterName: null,
          gangId: params.gang_id,
          userId: gang.user_id,
          fighterEquipmentId: newEquipmentId
        });

        if (beastResult.success && beastResult.createdBeasts.length > 0) {
          createdBeasts = beastResult.createdBeasts;
          // Note: Don't add to rating since equipment is in stash
        }
      } catch (error) {
        console.error('Error creating beasts for stash equipment:', error);
      }
    }

    // Calculate deltas for gang updates
    const totalRatingDelta = ratingDelta + createdBeastsRatingDelta + grantsRatingDelta;
    const stashValueDelta = params.buy_for_gang_stash ? ratingCost : 0;

    // Update gang credits, rating and wealth using centralized helper
    const financialResult = await updateGangFinancials(supabase, {
      gangId: params.gang_id,
      ratingDelta: totalRatingDelta,
      creditsDelta: -finalPurchaseCost - grantsRatingDelta,
      stashValueDelta
    });

    if (!financialResult.success) {
      throw new Error(financialResult.error || 'Failed to update gang financials');
    }

    // Log equipment actions AFTER gang rating is updated (so logs show correct rating)
    try {
      await logEquipmentAction({
        gang_id: params.gang_id,
        fighter_id: params.fighter_id,
        vehicle_id: params.vehicle_id,
        equipment_name: equipmentDetails.equipment_name,
        purchase_cost: finalPurchaseCost,
        action_type: 'purchased',
        user_id: user.id,
        oldCredits: financialResult.oldValues?.credits,
        oldRating: financialResult.oldValues?.rating,
        oldWealth: financialResult.oldValues?.wealth,
        newCredits: financialResult.newValues?.credits,
        newRating: financialResult.newValues?.rating,
        newWealth: financialResult.newValues?.wealth
      });
    } catch (logError) {
      console.error('Failed to log equipment action:', logError);
    }

    // Log granted equipment
    for (const grantedItem of grantedEquipmentForLogging) {
      try {
        await logEquipmentAction({
          gang_id: params.gang_id,
          fighter_id: params.fighter_id,
          vehicle_id: params.vehicle_id,
          equipment_name: grantedItem.equipment_name,
          purchase_cost: grantedItem.purchase_cost,
          action_type: 'granted',
          user_id: user.id,
          oldCredits: financialResult.oldValues?.credits,
          oldRating: financialResult.oldValues?.rating,
          oldWealth: financialResult.oldValues?.wealth,
          newCredits: financialResult.newValues?.credits,
          newRating: financialResult.newValues?.rating,
          newWealth: financialResult.newValues?.wealth
        });
      } catch (logError) {
        console.error('Failed to log granted equipment:', logError);
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
      // If this fighter is a beast, invalidate the owner's cache
      await invalidateBeastOwnerCache(params.fighter_id, params.gang_id, supabase);
    } else if (params.vehicle_id) {
      if (vehicleAssignedFighterId) {
        invalidateFighterDataWithFinancials(vehicleAssignedFighterId, params.gang_id);
        invalidateFighterVehicleData(vehicleAssignedFighterId, params.gang_id);
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
            credits: financialResult.newValues?.credits ?? (gang.credits - finalPurchaseCost),
            rating: financialResult.newValues?.rating ?? Math.max(0, (gang.rating || 0) + totalRatingDelta),
            wealth: financialResult.newValues?.wealth ?? Math.max(0, (gang.wealth || 0) + totalRatingDelta + (-finalPurchaseCost) + stashValueDelta)
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
        rating_cost: ratingCost,
        purchase_cost: finalPurchaseCost
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
          rating_cost: ratingCost,
          purchase_cost: finalPurchaseCost
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
          rating_cost: ratingCost,
          purchase_cost: finalPurchaseCost
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
          // Validate the effect type exists before applying
          const { data: effectTypeValidation } = await supabase
            .from('fighter_effect_types')
            .select('id, type_specific_data')
            .eq('id', chosenEffectTypeId)
            .single();

          if (!effectTypeValidation) {
            throw new Error('Invalid effect type');
          }

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

    // Clear any hardpoint that references this weapon — hardpoints must survive weapon removal
    if (equipmentBefore.vehicle_id) {
      await clearHardpointReference(supabase, params.fighter_equipment_id, equipmentBefore.vehicle_id);
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

      const fighterIsActive = countsTowardRating(fighter);

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

        const vehicleFighterIsActive = countsTowardRating(vehicleFighter);

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
      await updateGangRatingSimple(supabase, params.gang_id, ratingDelta);
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

    // If this fighter is a beast, invalidate the owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, params.gang_id, supabase);

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
      .select('id, gang_id, gang_stash, purchase_cost')
      .eq('id', params.stash_id)
      .single();
    if (fetchErr || !row) return { success: false, error: 'Stash item not found' };
    if (!row.gang_stash) return { success: false, error: 'Item is not in gang stash' };

    const purchaseCost = row.purchase_cost || 0;

    // Permission implicitly enforced by RLS; we still fetch to invalidate correctly
    const { error: delErr } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.stash_id);
    if (delErr) return { success: false, error: delErr.message };

    // Update wealth (stash value decreases, so wealth decreases)
    if (purchaseCost !== 0) {
      await updateGangFinancials(supabase, {
        gangId: row.gang_id,
        stashValueDelta: -purchaseCost
      });
    }

    invalidateGangStash({ gangId: row.gang_id, userId: user.id });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Apply multiple self-upgrade effects to equipment in a single batch operation.
 * This avoids race conditions from sequential calls and reduces network overhead.
 */
export async function applySelfUpgradesToEquipment(params: {
  fighter_equipment_id: string;
  effect_type_ids: string[];
  fighter_id: string;
  gang_id: string;
  credits_increase?: number;
}): Promise<EquipmentActionResult> {
  if (params.effect_type_ids.length === 0) {
    return { success: false, error: 'No effects to apply' };
  }

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Validate ownership once
    const { data: equipmentRow, error: equipErr } = await supabase
      .from('fighter_equipment')
      .select('id, fighter_id, gang_id')
      .eq('id', params.fighter_equipment_id)
      .single();

    if (equipErr || !equipmentRow) {
      return { success: false, error: 'Equipment not found' };
    }

    if (equipmentRow.fighter_id !== params.fighter_id || equipmentRow.gang_id !== params.gang_id) {
      return { success: false, error: 'Ownership mismatch' };
    }

    // Insert all effects
    const results: { effect_type_id: string; success: boolean; error?: string }[] = [];

    for (const effect_type_id of params.effect_type_ids) {
      const result = await insertEffectWithModifiers(
        supabase,
        {
          fighter_id: params.fighter_id,
          vehicle_id: null,
          fighter_equipment_id: params.fighter_equipment_id,
          target_equipment_id: null,
          effect_type_id,
          user_id: user.id
        },
        {
          checkDuplicate: true,
          includeOperation: true
        }
      );

      results.push({
        effect_type_id,
        success: result.success,
        error: result.error
      });
    }

    // Check if any failed
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      const appliedCount = results.length - failures.length;
      return {
        success: false,
        error: `${failures.length} effect(s) failed to apply${appliedCount > 0 ? ` (${appliedCount} succeeded)` : ''}: ${failures.map(f => f.error).join(', ')}`,
        data: { results }
      };
    }

    // Update gang rating/wealth only if there's a credits_increase
    if (params.credits_increase && params.credits_increase !== 0) {
      try {
        const { data: fighter } = await supabase
          .from('fighters')
          .select('killed, retired, enslaved, captured')
          .eq('id', params.fighter_id)
          .single();

        const fighterIsActive = fighter && countsTowardRating(fighter);
        await updateGangFinancials(supabase, {
          gangId: params.gang_id,
          ratingDelta: params.credits_increase,
          applyToRating: fighterIsActive ?? false
        });
      } catch (e) {
        console.error('Failed to update gang rating/wealth:', e);
      }
    }

    // Invalidate caches once at the end
    try {
      invalidateFighterAdvancement({
        fighterId: params.fighter_id,
        gangId: params.gang_id,
        advancementType: 'effect'
      });
    } catch (e) {
      console.error('Cache invalidation failed:', e);
    }

    return { success: true, data: { results } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

interface DeleteEquipmentEffectParams {
  effect_id: string;
  fighter_id: string;
  gang_id: string;
  fighter_equipment_id: string;
  credits_increase?: number;
}

/**
 * Deletes an equipment effect (self-upgrade effect).
 * This removes the effect from the fighter_effects table.
 */
export async function deleteEquipmentEffect(
  params: DeleteEquipmentEffectParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Check authentication
    await getAuthenticatedUser(supabase);

    // Verify the effect exists and belongs to the specified equipment
    const { data: effect, error: effectError } = await supabase
      .from('fighter_effects')
      .select('id, fighter_equipment_id, effect_name, type_specific_data')
      .eq('id', params.effect_id)
      .eq('fighter_equipment_id', params.fighter_equipment_id)
      .single();

    if (effectError || !effect) {
      return { success: false, error: 'Effect not found or does not belong to this equipment' };
    }

    // Delete the effect (cascade will handle modifiers)
    const { error: deleteError } = await supabase
      .from('fighter_effects')
      .delete()
      .eq('id', params.effect_id);

    if (deleteError) {
      return { success: false, error: `Failed to delete effect: ${deleteError.message}` };
    }

    // Update gang rating/wealth only if there's a credits_increase to subtract
    if (params.credits_increase && params.credits_increase !== 0) {
      try {
        const { data: fighter } = await supabase
          .from('fighters')
          .select('killed, retired, enslaved, captured')
          .eq('id', params.fighter_id)
          .single();

        const fighterIsActive = fighter && countsTowardRating(fighter);
        await updateGangFinancials(supabase, {
          gangId: params.gang_id,
          ratingDelta: -params.credits_increase,
          applyToRating: fighterIsActive ?? false
        });
      } catch (e) {
        console.error('Failed to update gang rating/wealth:', e);
      }
    }

    // Invalidate caches
    try {
      invalidateFighterAdvancement({
        fighterId: params.fighter_id,
        gangId: params.gang_id,
        advancementType: 'effect'
      });
    } catch (e) {
      console.error('Cache invalidation failed:', e);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
