import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import type { FighterBasic, FighterEquipment, FighterSkill, FighterEffect } from '@/app/lib/fighter-data'
import { queryKeys } from './keys'

// Extract query logic from existing functions in fighter-data.ts without unstable_cache
export async function queryFighterBasic(fighterId: string, supabase?: any): Promise<FighterBasic> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('fighters')
    .select(`
      id,
      fighter_name,
      label,
      note,
      note_backstory,
      credits,
      cost_adjustment,
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
      xp,
      special_rules,
      fighter_class,
      fighter_class_id,
      fighter_type,
      fighter_type_id,
      fighter_gang_legacy_id,
      fighter_gang_legacy:fighter_gang_legacy_id (
        id,
        fighter_type_id,
        name
      ),
      fighter_sub_type_id,
      killed,
      starved,
      retired,
      enslaved,
      recovery,
      captured,
      free_skill,
      kills,
      gang_id,
      fighter_pet_id,
      image_url,
      position
    `)
    .eq('id', fighterId)
    .single()

  if (error) throw error
  
  // Handle fighter_gang_legacy array conversion to single object
  const legacyData = Array.isArray(data.fighter_gang_legacy) 
    ? data.fighter_gang_legacy[0] || null 
    : data.fighter_gang_legacy

  return {
    ...data,
    fighter_gang_legacy: legacyData
  }
}

export async function queryFighterEquipment(fighterId: string, supabase?: any): Promise<FighterEquipment[]> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('fighter_equipment')
    .select(`
      id,
      equipment_id,
      custom_equipment_id,
      purchase_cost,
      original_cost,
      is_master_crafted,
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
    .eq('fighter_id', fighterId)
    .is('vehicle_id', null)

  if (error) throw error

  // Process each equipment item and add weapon profiles (copied from fighter-data.ts)
  const equipmentWithProfiles = await Promise.all(
    (data || []).map(async (item: any) => {
      const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type
      let weaponProfiles: any[] = []

      if (equipmentType === 'weapon') {
        if (item.equipment_id) {
          // Get standard weapon profiles
          const { data: profiles } = await client
            .from('weapon_profiles')
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
            .eq('weapon_id', item.equipment_id)
            .order('sort_order', { nullsFirst: false })
            .order('profile_name')

          weaponProfiles = (profiles || []).map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }))
        } else if (item.custom_equipment_id) {
          // Get custom weapon profiles
          const { data: profiles } = await client
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
            .or(`custom_equipment_id.eq.${item.custom_equipment_id},weapon_group_id.eq.${item.custom_equipment_id}`)
            .order('sort_order', { nullsFirst: false })
            .order('profile_name')

          weaponProfiles = (profiles || []).map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }))
        }
      }

      return {
        fighter_equipment_id: item.id,
        equipment_id: item.equipment_id || undefined,
        custom_equipment_id: item.custom_equipment_id || undefined,
        equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
        equipment_type: equipmentType || 'unknown',
        equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
        cost: item.purchase_cost || 0,
        purchase_cost: item.purchase_cost || 0,
        original_cost: item.original_cost,
        is_master_crafted: item.is_master_crafted || false,
        weapon_profiles: weaponProfiles
      }
    })
  )

  return equipmentWithProfiles
}

export async function queryFighterSkills(fighterId: string, supabase?: any): Promise<Record<string, FighterSkill>> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('fighter_skills')
    .select(`
      id,
      credits_increase,
      xp_cost,
      is_advance,
      fighter_effect_skill_id,
      created_at,
      skill:skill_id (
        name
      ),
      fighter_effect_skills!fighter_effect_skill_id (
        fighter_effects (
          effect_name
        )
      )
    `)
    .eq('fighter_id', fighterId)

  if (error) throw error

  const skills: Record<string, FighterSkill> = {}
  ;(data || []).forEach((skillData: any) => {
    const skillName = (skillData.skill as any)?.name
    if (skillName) {
      // Get the injury name from the related fighter effect
      const injuryName = skillData.fighter_effect_skills?.fighter_effects?.effect_name
      
      skills[skillName] = {
        id: skillData.id,
        name: skillName,
        credits_increase: skillData.credits_increase || 0,
        xp_cost: skillData.xp_cost || 0,
        is_advance: skillData.is_advance || false,
        fighter_injury_id: skillData.fighter_effect_skill_id || undefined,
        injury_name: injuryName || undefined,
        acquired_at: skillData.created_at,
      }
    }
  })

  return skills
}

export async function queryFighterEffects(fighterId: string, supabase?: any): Promise<Record<string, FighterEffect[]>> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('fighter_effects')
    .select(`
      id,
      effect_name,
      type_specific_data,
      created_at,
      updated_at,
      fighter_effect_type:fighter_effect_type_id (
        fighter_effect_category:fighter_effect_category_id (
          category_name
        )
      ),
      fighter_effect_modifiers (
        id,
        fighter_effect_id,
        stat_name,
        numeric_value
      )
    `)
    .eq('fighter_id', fighterId)
    .is('vehicle_id', null)

  if (error) throw error

  const effectsByCategory: Record<string, FighterEffect[]> = {}
  
  ;(data || []).forEach((effectData: any) => {
    const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized'
    
    if (!effectsByCategory[categoryName]) {
      effectsByCategory[categoryName] = []
    }

    effectsByCategory[categoryName].push({
      id: effectData.id,
      effect_name: effectData.effect_name,
      type_specific_data: effectData.type_specific_data,
      created_at: effectData.created_at,
      updated_at: effectData.updated_at || undefined,
      fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
    })
  })

  return effectsByCategory
}

export async function queryFighterVehicles(fighterId: string, supabase?: any): Promise<any[]> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('vehicles')
    .select(`
      id,
      created_at,
      movement,
      front,
      side,
      rear,
      hull_points,
      handling,
      save,
      body_slots,
      drive_slots,
      engine_slots,
      special_rules,
      vehicle_name,
      vehicle_type_id,
      vehicle_type,
      cost
    `)
    .eq('fighter_id', fighterId)

  if (error) throw error

  // For each vehicle, get equipment and effects
  const vehicles = await Promise.all(
    (data || []).map(async (vehicle: any) => {
      const [equipment, effects] = await Promise.all([
        queryVehicleEquipment(vehicle.id, client),
        queryVehicleEffects(vehicle.id, client)
      ])

      return {
        ...vehicle,
        equipment,
        effects
      }
    })
  )

  return vehicles
}

// Helper functions for vehicle data
export async function queryVehicleEquipment(vehicleId: string, supabase?: any): Promise<any[]> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('fighter_equipment')
    .select(`
      id,
      equipment_id,
      custom_equipment_id,
      purchase_cost,
      is_master_crafted,
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
    .eq('vehicle_id', vehicleId)

  if (error) return []

  // Process equipment with weapon profiles (similar to fighter equipment)
  const equipmentWithProfiles = await Promise.all(
    (data || []).map(async (item: any) => {
      const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type
      let weaponProfiles: any[] = []

      if (equipmentType === 'weapon') {
        if (item.equipment_id) {
          const { data: profiles } = await client
            .from('weapon_profiles')
            .select('*')
            .eq('weapon_id', item.equipment_id)
            .order('sort_order', { nullsFirst: false })
            .order('profile_name')

          weaponProfiles = (profiles || []).map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }))
        } else if (item.custom_equipment_id) {
          const { data: profiles } = await client
            .from('custom_weapon_profiles')
            .select('*')
            .or(`custom_equipment_id.eq.${item.custom_equipment_id},weapon_group_id.eq.${item.custom_equipment_id}`)
            .order('sort_order', { nullsFirst: false })
            .order('profile_name')

          weaponProfiles = (profiles || []).map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }))
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
        purchase_cost: item.purchase_cost || 0,
        weapon_profiles: weaponProfiles
      }
    })
  )

  return equipmentWithProfiles
}

export async function queryVehicleEffects(vehicleId: string, supabase?: any): Promise<Record<string, any[]>> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('fighter_effects')
    .select(`
      id,
      effect_name,
      type_specific_data,
      created_at,
      updated_at,
      fighter_effect_type:fighter_effect_type_id (
        fighter_effect_category:fighter_effect_category_id (
          category_name
        )
      ),
      fighter_effect_modifiers (
        id,
        fighter_effect_id,
        stat_name,
        numeric_value
      )
    `)
    .eq('vehicle_id', vehicleId)

  if (error) return {}

  const effectsByCategory: Record<string, any[]> = {}
  
  ;(data || []).forEach((effectData: any) => {
    const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized'
    
    if (!effectsByCategory[categoryName]) {
      effectsByCategory[categoryName] = []
    }

    effectsByCategory[categoryName].push({
      id: effectData.id,
      effect_name: effectData.effect_name,
      type_specific_data: effectData.type_specific_data,
      created_at: effectData.created_at,
      updated_at: effectData.updated_at,
      fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
    })
  })

  return effectsByCategory
}

export const fighterQueries = {
  // Query functions - reuse database query logic without cache
  basic: (fighterId: string) => ({
    queryKey: queryKeys.fighters.detail(fighterId),
    queryFn: () => queryFighterBasic(fighterId),
  }),

  equipment: (fighterId: string) => ({
    queryKey: queryKeys.fighters.equipment(fighterId),
    queryFn: () => queryFighterEquipment(fighterId),
  }),

  skills: (fighterId: string) => ({
    queryKey: queryKeys.fighters.skills(fighterId),
    queryFn: () => queryFighterSkills(fighterId),
  }),

  effects: (fighterId: string) => ({
    queryKey: queryKeys.fighters.effects(fighterId),
    queryFn: () => queryFighterEffects(fighterId),
  }),

  vehicles: (fighterId: string) => ({
    queryKey: queryKeys.fighters.vehicles(fighterId),
    queryFn: () => queryFighterVehicles(fighterId),
  }),
}

// =============================================================================
// CUSTOM HOOKS - Following TanStack Query best practices
// =============================================================================

export const useGetFighter = (
  fighterId: string, 
  options?: Partial<UseQueryOptions<FighterBasic, Error, FighterBasic, readonly (string | number)[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.detail(fighterId),
    queryFn: () => queryFighterBasic(fighterId),
    enabled: false, // Disabled since we're using server-side prefetching
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchOnWindowFocus: false, // Don't refetch on window focus
    ...options
  })
}

export const useGetFighterEquipment = (
  fighterId: string,
  options?: Partial<UseQueryOptions<FighterEquipment[], Error, FighterEquipment[], readonly (string | number)[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.equipment(fighterId),
    queryFn: () => queryFighterEquipment(fighterId),
    enabled: false, // Disabled since we're using server-side prefetching
    staleTime: 1000 * 60 * 2, // 2 minutes (equipment changes frequently)
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchOnWindowFocus: false, // Don't refetch on window focus
    ...options
  })
}

export const useGetFighterSkills = (
  fighterId: string,
  options?: Partial<UseQueryOptions<Record<string, FighterSkill>, Error, Record<string, FighterSkill>, readonly (string | number)[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.skills(fighterId),
    queryFn: () => queryFighterSkills(fighterId),
    enabled: false, // Disabled since we're using server-side prefetching
    staleTime: 1000 * 60 * 10, // 10 minutes (skills change less frequently)
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchOnWindowFocus: false, // Don't refetch on window focus
    ...options
  })
}

export const useGetFighterEffects = (
  fighterId: string,
  options?: Partial<UseQueryOptions<Record<string, FighterEffect[]>, Error, Record<string, FighterEffect[]>, readonly (string | number)[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.effects(fighterId),
    queryFn: () => queryFighterEffects(fighterId),
    enabled: false, // Disabled since we're using server-side prefetching
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchOnWindowFocus: false, // Don't refetch on window focus
    ...options
  })
}

export const useGetFighterVehicles = (
  fighterId: string,
  options?: Partial<UseQueryOptions<any[], Error, any[], readonly (string | number)[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.vehicles(fighterId),
    queryFn: () => queryFighterVehicles(fighterId),
    enabled: false, // Disabled since we're using server-side prefetching
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchOnWindowFocus: false, // Don't refetch on window focus
    ...options
  })
}

// Additional useful hooks
export const useGetFighterTotalCost = (
  fighterId: string,
  options?: Partial<UseQueryOptions<number, Error, number, readonly (string | number)[]>>
) => {
  return useQuery({
    queryKey: queryKeys.fighters.totalCost(fighterId),
    queryFn: async () => {
      // This would need to be implemented - calculate total cost from all fighter data
      const [basic, equipment, skills, effects, vehicles] = await Promise.all([
        queryFighterBasic(fighterId),
        queryFighterEquipment(fighterId), 
        queryFighterSkills(fighterId),
        queryFighterEffects(fighterId),
        queryFighterVehicles(fighterId)
      ])
      
      // Calculate total cost logic here
      const baseCost = basic.credits || 0
      const equipmentCost = equipment.reduce((sum, item) => sum + (item.purchase_cost || 0), 0)
      const skillsCost = Object.values(skills).reduce((sum, skill) => sum + (skill.credits_increase || 0), 0)
      const effectsCost = Object.values(effects).flat().reduce((sum, effect) => {
        return sum + ((effect.type_specific_data as any)?.credits_increase || 0)
      }, 0)
      const vehicleCost = vehicles.reduce((sum, vehicle) => sum + (vehicle.cost || 0), 0)
      const adjustment = basic.cost_adjustment || 0
      
      return baseCost + equipmentCost + skillsCost + effectsCost + vehicleCost + adjustment
    },
    enabled: false, // Disabled since we're using server-side prefetching
    staleTime: 1000 * 60 * 2, // 2 minutes (depends on frequently changing data)
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchOnWindowFocus: false, // Don't refetch on window focus
    ...options
  })
}