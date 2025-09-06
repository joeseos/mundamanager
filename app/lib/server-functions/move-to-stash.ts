'use server'

import { logEquipmentAction } from '@/app/actions/logs/equipment-logs'

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

export interface MoveToStashInput {
  fighter_equipment_id: string
}

export interface MoveToStashResponse {
  moved_equipment: {
    id: string
    equipment_name: string
    equipment_type: string
    equipment_category: string
    purchase_cost: number
    fighter_id?: string
    vehicle_id?: string
  }
  deleted_effects: any[]
  fighter_total_cost?: number
}

export async function moveEquipmentToStash(params: MoveToStashInput): Promise<ServerFunctionResult<MoveToStashResponse>> {
  try {
    const { user, supabase } = await createServerContext()
    
    // Get equipment details before moving
    const { data: equipmentBefore, error: equipmentError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        fighter_id,
        vehicle_id,
        gang_id,
        equipment_id,
        custom_equipment_id,
        purchase_cost,
        gang_stash,
        equipment:equipment_id (
          equipment_name,
          equipment_type,
          equipment_category
        ),
        custom_equipment:custom_equipment_id (
          equipment_name,
          equipment_type,
          equipment_category
        )
      `)
      .eq('id', params.fighter_equipment_id)
      .single()

    if (equipmentError || !equipmentBefore) {
      throw new Error(`Equipment with ID ${params.fighter_equipment_id} not found`)
    }

    // Check if already in stash
    if (equipmentBefore.gang_stash) {
      throw new Error('Equipment is already in gang stash')
    }

    // Security check - ensure user owns this gang
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', equipmentBefore.gang_id)
      .single()

    if (gangError || !gang) {
      throw new Error('Gang not found')
    }

    if (gang.user_id !== user.id) {
      // Check if user is admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_role')
        .eq('id', user.id)
        .single()
      
      if (!profile || profile.user_role !== 'admin') {
        throw new Error('Not authorized to access this gang')
      }
    }

    // Get associated fighter effects before moving (they'll be cascade deleted when we unassign)
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

    // Calculate rating delta before moving
    let ratingDelta = 0
    if (equipmentBefore.fighter_id) {
      ratingDelta -= (equipmentBefore.purchase_cost || 0)
      // subtract associated effects credits if any
      const effectsCredits = (associatedEffects || []).reduce((sum: number, eff: any) => sum + (eff.type_specific_data?.credits_increase || 0), 0)
      ratingDelta -= effectsCredits
    } else if (equipmentBefore.vehicle_id) {
      // Only count if vehicle is assigned
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

    // Delete associated fighter effects before moving to stash
    // Effects should not remain active when equipment is in stash
    if (associatedEffects && associatedEffects.length > 0) {
      const effectIds = associatedEffects.map((effect: any) => effect.id);
      const { error: deleteEffectsError } = await supabase
        .from('fighter_effects')
        .delete()
        .in('id', effectIds);

      if (deleteEffectsError) {
        console.error('Failed to delete associated effects:', deleteEffectsError);
        // Don't fail the main operation, but log the error
      }
    }

    // Move equipment to stash by unassigning fighter_id and vehicle_id, and setting gang_stash = true
    const { error: updateError } = await supabase
      .from('fighter_equipment')
      .update({ 
        fighter_id: null, 
        vehicle_id: null, 
        gang_stash: true 
      })
      .eq('id', params.fighter_equipment_id)

    if (updateError) {
      throw new Error(`Failed to move equipment to stash: ${updateError.message}`)
    }

    // Log equipment action
    try {
      const equipmentData = equipmentBefore.equipment as any
      const customEquipmentData = equipmentBefore.custom_equipment as any
      const equipmentName = equipmentData?.equipment_name || 
                           customEquipmentData?.equipment_name || 
                           'Unknown Equipment'

      await logEquipmentAction({
        gang_id: equipmentBefore.gang_id,
        fighter_id: equipmentBefore.fighter_id,
        vehicle_id: equipmentBefore.vehicle_id,
        equipment_name: equipmentName,
        purchase_cost: equipmentBefore.purchase_cost || 0,
        action_type: 'moved_to_stash',
        user_id: user.id
      })
    } catch (logError) {
      console.error('Failed to log equipment move to stash:', logError)
      // Don't fail the main operation for logging errors
    }

    // Update rating if needed
    if (ratingDelta !== 0) {
      try {
        // Get current rating and update
        const { data: curr } = await supabase
          .from('gangs')
          .select('rating')
          .eq('id', equipmentBefore.gang_id)
          .single()
        const currentRating = (curr?.rating ?? 0) as number
        await supabase
          .from('gangs')
          .update({ rating: Math.max(0, currentRating + ratingDelta) })
          .eq('id', equipmentBefore.gang_id)
      } catch (e) {
        console.error('Failed to update gang rating after moving equipment to stash:', e)
      }
    }

    // Get fresh fighter total cost after move for accurate response
    let freshFighterTotalCost: number | undefined = undefined
    if (equipmentBefore.fighter_id) {
      try {
        const { getFighterTotalCost } = await import('@/app/lib/fighter-data')
        freshFighterTotalCost = await getFighterTotalCost(equipmentBefore.fighter_id, supabase)
      } catch (fighterRefreshError) {
        console.warn('Could not refresh fighter total cost:', fighterRefreshError)
      }
    }

    // Calculate equipment details for response
    const equipmentData = equipmentBefore.equipment as any
    const customEquipmentData = equipmentBefore.custom_equipment as any
    
    const equipmentName = equipmentData?.equipment_name || 
                         customEquipmentData?.equipment_name || 
                         'Unknown Equipment'
    
    const equipmentType = equipmentData?.equipment_type || 
                         customEquipmentData?.equipment_type || 
                         'unknown'
    
    const equipmentCategory = equipmentData?.equipment_category || 
                             customEquipmentData?.equipment_category || 
                             'unknown'
    
    return {
      success: true,
      data: {
        moved_equipment: {
          id: equipmentBefore.id,
          equipment_name: equipmentName,
          equipment_type: equipmentType,
          equipment_category: equipmentCategory,
          purchase_cost: equipmentBefore.purchase_cost || 0,
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
