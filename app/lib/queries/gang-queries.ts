import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import type { GangBasic } from '@/app/lib/gang-data'
import { queryKeys } from './keys'

// Extract query logic from existing functions in gang-data.ts without unstable_cache
export async function queryGangBasic(gangId: string, supabase?: any): Promise<GangBasic> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('gangs')
    .select(`
      id,
      name,
      gang_type,
      gang_type_id,
      gang_colour,
      reputation,
      meat,
      scavenging_rolls,
      exploration_points,
      alignment,
      note,
      note_backstory,
      created_at,
      last_updated,
      alliance_id,
      gang_variants,
      user_id,
      gang_affiliation_id,
      gang_affiliation:gang_affiliation_id (
        id,
        name
      ),
      gang_types!gang_type_id(
        affiliation
      ),
      image_url
    `)
    .eq('id', gangId)
    .single()

  if (error) throw error
  
  // Handle gang_affiliation array conversion to single object
  const affiliationData = Array.isArray(data.gang_affiliation) 
    ? data.gang_affiliation[0] || null 
    : data.gang_affiliation

  // Handle gang_types array conversion to single object
  const gangTypesData = Array.isArray(data.gang_types) 
    ? data.gang_types[0] || null 
    : data.gang_types

  return {
    ...data,
    gang_affiliation: affiliationData,
    gang_types: gangTypesData
  }
}

export async function queryGangCredits(gangId: string, supabase?: any): Promise<number> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('gangs')
    .select('credits')
    .eq('id', gangId)
    .single()

  if (error) throw error
  return data.credits
}

export async function queryGangPositioning(gangId: string, supabase?: any): Promise<Record<string, any> | null> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('gangs')
    .select('positioning')
    .eq('id', gangId)
    .single()

  if (error) throw error
  return data.positioning || null
}

export async function queryGangResources(gangId: string, supabase?: any): Promise<{
  meat: number
  reputation: number
  scavenging_rolls: number
  exploration_points: number
}> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('gangs')
    .select('meat, reputation, scavenging_rolls, exploration_points')
    .eq('id', gangId)
    .single()

  if (error) throw error
  return data
}

export async function queryGangRating(gangId: string): Promise<number> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('gangs')
    .select('rating')
    .eq('id', gangId)
    .single()

  if (error) throw error
  return (data?.rating ?? 0) as number
}

export async function queryGangFighterCount(gangId: string): Promise<number> {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('fighters')
    .select('*', { count: 'exact', head: true })
    .eq('gang_id', gangId)
    .eq('killed', false)
    .eq('retired', false)
    .eq('enslaved', false)
    .eq('captured', false)

  if (error) throw error
  return count || 0
}

export async function queryGangFighterIds(gangId: string, supabase?: any): Promise<{
  fighterIds: string[],
  positioning: Record<number, string>
}> {
  const client = supabase || createClient()
  const { data, error } = await client
    .from('fighters')
    .select('id, position')
    .eq('gang_id', gangId)
    .order('position', { nullsFirst: false })
    .order('created_at')

  if (error) throw error

  const fighters = data || []
  const fighterIds = fighters.map((f: any) => f.id)
  
  // Build positioning map
  const positioning: Record<number, string> = {}
  fighters.forEach((fighter: any, index: number) => {
    const pos = fighter.position !== null ? fighter.position : index
    positioning[pos] = fighter.id
  })

  return { fighterIds, positioning }
}

// gangQueries removed - using centralized queryKeys from keys.ts instead

// =============================================================================
// CUSTOM HOOKS
// =============================================================================

export const useGetGang = (
  gangId: string,
  options?: Partial<UseQueryOptions<GangBasic, Error, GangBasic, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.detail(gangId),
    queryFn: () => queryGangBasic(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 10, // 10 minutes (gang info changes less frequently)
    ...options
  })
}

export const useGetGangCredits = (
  gangId: string,
  options?: Partial<UseQueryOptions<number, Error, number, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.credits(gangId),
    queryFn: () => queryGangCredits(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 1, // 1 minute (credits change frequently)
    ...options
  })
}

export const useGetGangPositioning = (
  gangId: string,
  options?: Partial<UseQueryOptions<Record<string, any> | null, Error, Record<string, any> | null, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.positioning(gangId),
    queryFn: () => queryGangPositioning(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options
  })
}

export const useGetGangResources = (
  gangId: string,
  options?: Partial<UseQueryOptions<{meat: number, reputation: number, scavenging_rolls: number, exploration_points: number}, Error, any, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.resources(gangId),
    queryFn: () => queryGangResources(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options
  })
}

export const useGetGangRating = (
  gangId: string,
  options?: Partial<UseQueryOptions<number, Error, number, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.rating(gangId),
    queryFn: () => queryGangRating(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 5, // 5 minutes (rating changes with fighter changes)
    ...options
  })
}

export const useGetGangFighterCount = (
  gangId: string,
  options?: Partial<UseQueryOptions<number, Error, number, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.fighterCount(gangId),
    queryFn: () => queryGangFighterCount(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options
  })
}

export const useGetGangFighterIds = (
  gangId: string,
  options?: Partial<UseQueryOptions<{fighterIds: string[], positioning: Record<number, string>}, Error, {fighterIds: string[], positioning: Record<number, string>}, readonly string[]>>
) => {
  return useQuery({
    queryKey: queryKeys.gangs.fighterIds(gangId),
    queryFn: () => queryGangFighterIds(gangId),
    enabled: !!gangId && gangId !== 'placeholder',
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options
  })
}