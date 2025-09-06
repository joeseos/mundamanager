'use server'

// Cache invalidation handled by TanStack Query optimistic updates
import { logEquipmentAction } from '@/app/actions/logs/equipment-logs'
import { getFighterTotalCost } from '@/app/lib/fighter-data'
import type { Equipment } from '@/types/equipment'

// Type-safe server function patterns for Next.js + TanStack Query integration
export type ServerFunctionResult<T = unknown> = {
  success: true
  data: T
} | {
  success: false
  error: string
}

export interface ServerFunctionContext {
  user: any  // AuthUser type from supabase
  supabase: any
}

// Helper function to create server function context
async function createServerContext(): Promise<ServerFunctionContext> {
  const { createClient } = await import("@/utils/supabase/server")
  const { getAuthenticatedUser } = await import("@/utils/auth")
  
  const supabase = await createClient()
  const user = await getAuthenticatedUser(supabase)
  
  return {
    user,
    supabase
  }
}

// Equipment operation types
export interface BuyEquipmentInput {
  gang_id: string
  fighter_id?: string
  vehicle_id?: string
  equipment_id?: string
  custom_equipment_id?: string
  manual_cost?: number
  master_crafted?: boolean
  use_base_cost_for_rating?: boolean
  buy_for_gang_stash?: boolean
  selected_effect_ids?: string[]
  item_data?: any // For optimistic updates - not used by server
}

export interface BuyEquipmentResponse {
  equipment: {
    fighter_equipment_id: string
    equipment_id?: string
    custom_equipment_id?: string
    equipment_name: string
    equipment_type: string
    equipment_category: string
    purchase_cost: number
    original_cost?: number
    is_master_crafted?: boolean
    weapon_profiles?: any[]
  }
  gang_credits: number
  fighter_total_cost?: number
  rating_cost: number
  gang_rating_delta: number
  applied_effects: any[]
  created_beasts: any[]
}

export interface DeleteEquipmentInput {
  fighter_equipment_id: string
  gang_id: string
  fighter_id: string
  vehicle_id?: string
}

export interface DeleteEquipmentResponse {
  deleted_equipment: {
    id: string
    equipment_name: string
    cost: number
    fighter_id?: string
    vehicle_id?: string
  }
  deleted_effects: any[]
  fighter_total_cost?: number
}

export interface DeleteStashEquipmentInput {
  stash_id: string
}

export interface DeleteStashEquipmentResponse {
  deleted_stash_id: string
}

export async function buyEquipmentForFighter(params: BuyEquipmentInput): Promise<ServerFunctionResult<BuyEquipmentResponse>> {
  try {
    const { user, supabase } = await createServerContext()
    // Validate parameters
    if (!params.gang_id) {
      throw new Error('gang_id is required')
    }

    if (!params.buy_for_gang_stash && (!params.fighter_id && !params.vehicle_id)) {
      throw new Error('fighter_id or vehicle_id is required for non-stash purchases')
    }

    // PARALLEL: Gang info, security check, and fighter/vehicle data
    const [gangResult, profileResult, fighterResult, vehicleResult] = await Promise.all([
      // Gang info
      supabase
        .from('gangs')
        .select('id, credits, gang_type_id, user_id, rating')
        .eq('id', params.gang_id)
        .single(),
      
      // Security check profile (for potential admin verification)
      supabase
        .from('profiles')
        .select('user_role')
        .eq('id', user.id)
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
    ])

    const { data: gang, error: gangError } = gangResult
    if (gangError || !gang) {
      throw new Error('Gang not found')
    }

    // Security check
    if (gang.user_id !== user.id) {
      const { data: profile } = profileResult
      if (!profile || profile.user_role !== 'admin') {
        throw new Error('Not authorized to access this gang')
      }
    }

    // Extract parallel query results
    const fighterTypeId = fighterResult.data?.fighter_type_id || null
    const vehicleAssignedFighterId = vehicleResult.data?.fighter_id || null

    // Get equipment details
    let equipmentDetails: any
    let baseCost: number
    let adjustedCost: number
    let weaponProfiles: any[] = []
    let customWeaponProfiles: any[] = []
    let equipmentType: string
    let equipmentCategory: string

    if (params.equipment_id) {
      // Fetch Equipment details
      const { data: equipment, error: equipError } = await supabase
        .from('equipment')
        .select(`
          id,
          equipment_name,
          equipment_type,
          equipment_category,
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
            weapon_group_id,
            sort_order
          )
        `)
        .eq('id', params.equipment_id)
        .single()

      if (equipError || !equipment) {
        throw new Error('Equipment not found')
      }

      equipmentDetails = equipment
      baseCost = equipment.cost
      equipmentType = equipment.equipment_type
      equipmentCategory = equipment.equipment_category
      weaponProfiles = equipment.weapon_profiles || []

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
      )

      if (priceErr) {
        console.warn('Price resolution via RPC failed; falling back to base cost:', priceErr)
      }

      adjustedCost = Array.isArray(pricedRows) && pricedRows[0]?.adjusted_cost != null
        ? pricedRows[0].adjusted_cost
        : equipment.cost
    } else if (params.custom_equipment_id) {
      // PARALLEL: Custom equipment and profiles
      const [customEquipResult, profilesResult] = await Promise.all([
        // Custom equipment details
        supabase
          .from('custom_equipment')
          .select('id, equipment_name, equipment_type, equipment_category, cost')
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
            weapon_group_id,
            sort_order
          `)
          .or(`custom_equipment_id.eq.${params.custom_equipment_id},weapon_group_id.eq.${params.custom_equipment_id}`)
          .eq('user_id', user.id)
          .order('sort_order', { nullsFirst: false })
          .order('profile_name')
      ])

      const { data: customEquip, error: customError } = customEquipResult
      if (customError || !customEquip) {
        throw new Error('Custom equipment not found')
      }

      equipmentDetails = customEquip
      baseCost = customEquip.cost
      adjustedCost = customEquip.cost
      equipmentType = customEquip.equipment_type
      equipmentCategory = customEquip.equipment_category

      // Only use weapon profiles if it's actually a weapon
      if (customEquip.equipment_type === 'weapon') {
        const { data: profiles } = profilesResult
        customWeaponProfiles = profiles || []
      }
    } else {
      throw new Error('Either equipment_id or custom_equipment_id is required')
    }

    // Calculate final costs (matching server action logic exactly)
    const finalPurchaseCost = params.manual_cost ?? adjustedCost
    let ratingCost = params.use_base_cost_for_rating ? adjustedCost : finalPurchaseCost

    // Apply master-crafted bonus for weapons
    if (equipmentType === 'weapon' && params.master_crafted) {
      ratingCost = Math.ceil((ratingCost * 1.25) / 5) * 5
    }

    // Check gang credits
    if (finalPurchaseCost > 0 && gang.credits < finalPurchaseCost) {
      throw new Error(`Gang has insufficient credits. Required: ${finalPurchaseCost}, Available: ${gang.credits}`)
    }

    // Insert equipment
    let newEquipmentId: string
    
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
          is_master_crafted: equipmentType === 'weapon' && params.master_crafted
        })
        .select('id')
        .single()

      if (stashError) {
        throw new Error(`Failed to add to gang stash: ${stashError.message}`)
      }
      newEquipmentId = stashItem.id
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
          is_master_crafted: equipmentType === 'weapon' && params.master_crafted
        })
        .select('id')
        .single()

      if (equipError) {
        throw new Error(`Failed to add equipment: ${equipError.message}`)
      }
      newEquipmentId = fighterEquip.id
    }

    // Update gang credits
    const { error: updateError } = await supabase
      .from('gangs')
      .update({ credits: gang.credits - finalPurchaseCost })
      .eq('id', params.gang_id)

    if (updateError) {
      throw new Error(`Failed to update gang credits: ${updateError.message}`)
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
      })
    } catch (logError) {
      console.error('Failed to log equipment action:', logError)
    }

    // Initialize rating delta
    let ratingDelta = 0
    if (!params.buy_for_gang_stash) {
      if (params.fighter_id) {
        ratingDelta += ratingCost
      } else if (params.vehicle_id && vehicleAssignedFighterId) {
        ratingDelta += ratingCost
      }
    }

    // BATCH: Handle fighter effects with direct database operations
    let appliedEffects: any[] = []
    
    if (params.selected_effect_ids && params.selected_effect_ids.length > 0 && !params.buy_for_gang_stash && !params.custom_equipment_id) {
      try {
        // Get all effect type data in one query
        const { data: effectTypes } = await supabase
          .from('fighter_effect_types')
          .select(`
            id,
            effect_name,
            type_specific_data,
            fighter_effect_categories (
              id,
              category_name
            ),
            fighter_effect_type_modifiers (
              stat_name,
              default_numeric_value
            )
          `)
          .in('id', params.selected_effect_ids)

        if (effectTypes && effectTypes.length > 0) {
          // Batch insert all effects
          const effectsToInsert = effectTypes.map((effectType: any) => ({
            fighter_id: params.fighter_id || null,
            vehicle_id: params.vehicle_id || null,
            fighter_effect_type_id: effectType.id,
            effect_name: effectType.effect_name,
            type_specific_data: effectType.type_specific_data,
            fighter_equipment_id: newEquipmentId,
            user_id: user.id
          }))

          const { data: insertedEffects, error: effectsError } = await supabase
            .from('fighter_effects')
            .insert(effectsToInsert)
            .select('id, fighter_effect_type_id')

          if (effectsError) {
            throw new Error(`Failed to insert effects: ${effectsError.message}`)
          }

          if (insertedEffects && insertedEffects.length > 0) {
            // Batch insert all modifiers
            const allModifiers: any[] = []
            effectTypes.forEach((effectType: any, index: number) => {
              const effectId = insertedEffects[index].id
              if (effectType.fighter_effect_type_modifiers) {
                effectType.fighter_effect_type_modifiers.forEach((modifier: any) => {
                  allModifiers.push({
                    fighter_effect_id: effectId,
                    stat_name: modifier.stat_name,
                    numeric_value: modifier.default_numeric_value
                  })
                })
              }
            })

            if (allModifiers.length > 0) {
              await supabase.from('fighter_effect_modifiers').insert(allModifiers)
            }

            // Fetch actual inserted modifiers to match RPC response format
            let actualModifiers: any[] = []
            if (allModifiers.length > 0) {
              const { data } = await supabase
                .from('fighter_effect_modifiers')
                .select('id, fighter_effect_id, stat_name, numeric_value')
                .in('fighter_effect_id', insertedEffects.map((effect: any) => effect.id))
              actualModifiers = data || []
            }

            // Build applied effects response and calculate rating delta
            effectTypes.forEach((effectType: any, index: number) => {
              const insertedEffect = insertedEffects[index]
              if (insertedEffect) {
                // Get modifiers for this specific effect
                const effectModifiers = actualModifiers?.filter(mod => mod.fighter_effect_id === insertedEffect.id) || []
                
                appliedEffects.push({
                  id: insertedEffect.id,
                  effect_name: effectType.effect_name,
                  type_specific_data: effectType.type_specific_data,
                  created_at: new Date().toISOString(),
                  category_name: (effectType.fighter_effect_categories as any)?.category_name,
                  fighter_effect_modifiers: effectModifiers
                })

                // Rating delta calculation
                const creditsIncrease = effectType.type_specific_data?.credits_increase || 0
                if (params.fighter_id) {
                  ratingDelta += creditsIncrease
                } else if (params.vehicle_id && vehicleAssignedFighterId) {
                  ratingDelta += creditsIncrease
                }
              }
            })
          }
        }
      } catch (effectError) {
        console.error('Error applying effects:', effectError)
      }
    }

    // Handle beast creation for fighter equipment purchases
    let createdBeasts: any[] = []
    let createdBeastsRatingDelta = 0
    
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
              intelligence,
              special_rules
            )
          `)
          .eq('equipment_id', params.equipment_id)

        if (beastConfigs && beastConfigs.length > 0) {
          // Create beast fighters for each beast config
          for (const beastConfig of beastConfigs) {
            const fighterType = beastConfig.fighter_types
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
                  special_rules: fighterType.special_rules || [],
                  xp: 0
                })
                .select('id, fighter_name, fighter_type, fighter_class, credits, created_at')
                .single()

              if (createError || !newFighter) {
                console.error('Error creating beast fighter:', createError)
                continue
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
                .not('equipment_id', 'is', null)

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
                    })
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
                .single()

              if (ownershipRecord) {
                // Link the beast to its ownership record for cascade deletion
                await supabase
                  .from('fighters')
                  .update({ fighter_pet_id: ownershipRecord.id })
                  .eq('id', newFighter.id)

                createdBeasts.push({
                  id: newFighter.id,
                  fighter_name: newFighter.fighter_name,
                  fighter_type: newFighter.fighter_type,
                  fighter_class: newFighter.fighter_class,
                  credits: newFighter.credits,
                  equipment_source: 'Granted by equipment',
                  created_at: newFighter.created_at
                })

                // Increase rating by base beast cost (counted via owner semantics)
                const baseBeastCost = (fighterType.cost || 0)
                createdBeastsRatingDelta += baseBeastCost
              }
            }
          }
        }
      } catch (beastCreationError) {
        console.error('Error in beast creation process:', beastCreationError)
      }
    }

    // Update rating if needed
    if (ratingDelta !== 0 || createdBeastsRatingDelta !== 0) {
      const newRating = Math.max(0, (gang.rating || 0) + ratingDelta + createdBeastsRatingDelta)
      await supabase
        .from('gangs')
        .update({ rating: newRating })
        .eq('id', params.gang_id)

      // Cache invalidation handled by TanStack Query optimistic updates
    }

    // Get updated fighter total cost
    let fighterTotalCost: number | undefined = undefined
    if (params.fighter_id && !params.buy_for_gang_stash) {
      try {
        fighterTotalCost = await getFighterTotalCost(params.fighter_id, supabase)
      } catch (error) {
        console.warn('Could not get fighter total cost:', error)
      }
    }

    // Build the Equipment object that matches SSR FighterEquipment structure exactly
    const equipmentRecord = {
      fighter_equipment_id: newEquipmentId,
      equipment_id: params.equipment_id,
      custom_equipment_id: params.custom_equipment_id,
      equipment_name: equipmentDetails.equipment_name,
      equipment_type: equipmentType,
      equipment_category: equipmentCategory,
      purchase_cost: ratingCost, // Primary cost field - matches SSR structure
      original_cost: baseCost,
      is_master_crafted: equipmentType === 'weapon' && (params.master_crafted || false),
      weapon_profiles: equipmentType === 'weapon' 
        ? (params.equipment_id ? weaponProfiles : customWeaponProfiles).map((profile: any) => ({
            ...profile,
            is_master_crafted: equipmentType === 'weapon' && (params.master_crafted || false)
          }))
        : []
    }

    return {
      success: true,
      data: {
        equipment: equipmentRecord,
        gang_credits: gang.credits - finalPurchaseCost,
        fighter_total_cost: fighterTotalCost,
        rating_cost: ratingCost,
        gang_rating_delta: ratingDelta + createdBeastsRatingDelta,
        applied_effects: appliedEffects,
        created_beasts: createdBeasts
      }
    }
  } catch (error) {
    console.error('Server function error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }
  }
}

export async function deleteEquipmentFromFighter(params: DeleteEquipmentInput): Promise<ServerFunctionResult<DeleteEquipmentResponse>> {
  try {
    const { supabase } = await createServerContext()
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
      .single()

    if (equipmentError || !equipmentBefore) {
      throw new Error(`Equipment with ID ${params.fighter_equipment_id} not found`)
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
      .eq('fighter_equipment_id', params.fighter_equipment_id)

    // Determine rating delta prior to deletion
    let ratingDelta = 0
    if (equipmentBefore.fighter_id) {
      ratingDelta -= (equipmentBefore.purchase_cost || 0)
      // subtract associated effects credits if any
      const effectsCredits = (associatedEffects || []).reduce((sum: number, eff: any) => sum + (eff.type_specific_data?.credits_increase || 0), 0)
      ratingDelta -= effectsCredits
    } else if (equipmentBefore.vehicle_id) {
      // Only count if vehicle assigned
      const { data: veh } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', equipmentBefore.vehicle_id)
        .single()
      if (veh?.fighter_id) {
        ratingDelta -= (equipmentBefore.purchase_cost || 0)
        const effectsCredits = (associatedEffects || []).reduce((sum: number, eff: any) => sum + (eff.type_specific_data?.credits_increase || 0), 0)
        ratingDelta -= effectsCredits
      }
    }

    // Delete the equipment (cascade will handle fighter effects automatically)
    const { error: deleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.fighter_equipment_id)

    if (deleteError) {
      throw new Error(`Failed to delete equipment: ${deleteError.message}`)
    }

    // Log equipment deletion
    try {
      const equipmentData = equipmentBefore.equipment as any
      const customEquipmentData = equipmentBefore.custom_equipment as any
      const equipmentName = equipmentData?.equipment_name || 
                           customEquipmentData?.equipment_name || 
                           'Unknown Equipment'

      await logEquipmentAction({
        gang_id: params.gang_id,
        fighter_id: equipmentBefore.fighter_id,
        vehicle_id: equipmentBefore.vehicle_id,
        equipment_name: equipmentName,
        purchase_cost: equipmentBefore.purchase_cost || 0,
        action_type: 'sold'
      })
    } catch (logError) {
      console.error('Failed to log equipment deletion:', logError)
      // Don't fail the main operation for logging errors
    }

    // Update rating if needed
    if (ratingDelta !== 0) {
      try {
        // Get current rating and update
        const { data: curr } = await supabase
          .from('gangs')
          .select('rating')
          .eq('id', params.gang_id)
          .single()
        const currentRating = (curr?.rating ?? 0) as number
        await supabase
          .from('gangs')
          .update({ rating: Math.max(0, currentRating + ratingDelta) })
          .eq('id', params.gang_id)
        // Cache invalidation handled by TanStack Query optimistic updates
      } catch (e) {
        console.error('Failed to update gang rating after equipment deletion:', e)
      }
    }

    // Get fresh fighter total cost after deletion for accurate response
    let freshFighterTotalCost: number | undefined = undefined
    try {
      freshFighterTotalCost = await getFighterTotalCost(params.fighter_id, supabase)
    } catch (fighterRefreshError) {
      console.warn('Could not refresh fighter total cost:', fighterRefreshError)
    }

    // Calculate equipment details for response
    const equipmentData = equipmentBefore.equipment as any
    const customEquipmentData = equipmentBefore.custom_equipment as any
    
    const equipmentCost = equipmentData?.cost || 
                         customEquipmentData?.cost || 
                         equipmentBefore.purchase_cost || 0

    const equipmentName = equipmentData?.equipment_name || 
                         customEquipmentData?.equipment_name || 
                         'Unknown Equipment'
    
    return {
      success: true,
      data: {
        deleted_equipment: {
          id: equipmentBefore.id,
          equipment_name: equipmentName,
          cost: equipmentCost,
          fighter_id: equipmentBefore.fighter_id,
          vehicle_id: equipmentBefore.vehicle_id
        },
        deleted_effects: associatedEffects || [],
        fighter_total_cost: freshFighterTotalCost
      }
    }
  } catch (error) {
    console.error('Server function error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }
  }
}

export async function deleteEquipmentFromStash(params: DeleteStashEquipmentInput): Promise<ServerFunctionResult<DeleteStashEquipmentResponse>> {
  try {
    const { supabase } = await createServerContext()
    const { data: row, error: fetchErr } = await supabase
      .from('fighter_equipment')
      .select('id, gang_id, gang_stash')
      .eq('id', params.stash_id)
      .single()
    if (fetchErr || !row) throw new Error('Stash item not found')
    if (!row.gang_stash) throw new Error('Item is not in gang stash')

    // Permission implicitly enforced by RLS; we still fetch to invalidate correctly
    const { error: delErr } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.stash_id)
    if (delErr) throw new Error(delErr.message)

    return {
      success: true,
      data: {
        deleted_stash_id: params.stash_id
      }
    }
  } catch (error) {
    console.error('Server function error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }
  }
}
