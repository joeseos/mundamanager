'use server'

import { createClient } from '@/utils/supabase/server';
import { unstable_cache } from 'next/cache';

// Types for the unified fighter types response
export interface FighterTypeEquipment {
  id: string;
  equipment_name: string;
  equipment_type: string;
  equipment_category: string;
  cost: number;
  quantity: number;
  is_default: boolean;
  replacements: FighterTypeEquipment[];
}

export interface FighterTypeEquipmentSelection {
  single: {
    wargear: FighterTypeEquipment[][];
    weapons: FighterTypeEquipment[][];
  };
  multiple: {
    wargear: FighterTypeEquipment[][];
    weapons: FighterTypeEquipment[][];
  };
  optional: {
    wargear: FighterTypeEquipment[][];
    weapons: FighterTypeEquipment[][];
  };
  optional_single: {
    wargear: FighterTypeEquipment[][];
    weapons: FighterTypeEquipment[][];
  };
}

export interface FighterTypeSubType {
  id: string;
  sub_type_name: string;
}

export interface FighterType {
  id: string;
  fighter_type: string;
  fighter_class: string;
  fighter_class_id?: string; // Only for regular fighters
  gang_type: string;
  cost: number;
  gang_type_id: string;
  special_rules: string[];
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  attacks: number;
  limitation: number;
  alignment?: string; // Only for gang additions
  is_gang_addition?: boolean; // Only for gang additions
  alliance_id?: string; // Only for gang additions
  alliance_crew_name?: string; // Only for gang additions
  default_equipment: FighterTypeEquipment[];
  equipment_selection: FighterTypeEquipmentSelection | null;
  total_cost: number;
  sub_type: FighterTypeSubType | null;
}

interface GetFighterTypesParams {
  gangTypeId?: string;
  isGangAddition?: boolean;
  includeClassId?: boolean;
  gangVariants?: Array<{id: string, variant: string}>;
}

interface GetFighterTypesResult {
  success: boolean;
  data?: FighterType[];
  error?: string;
}

// Internal helper function that consolidates both SQL functions
async function _getFighterTypesUnified(params: GetFighterTypesParams, supabase: any) {
  try {
    let data;
    
    if (params.isGangAddition) {
      // Use get_fighter_types_with_cost for gang additions
      const { data: result, error } = await supabase.rpc('get_fighter_types_with_cost', {
        p_gang_type_id: params.gangTypeId || null,
        p_is_gang_addition: true
      });
      
      if (error) throw error;
      data = result;
    } else {
      // Use get_add_fighter_details for regular fighters
      if (!params.gangTypeId) {
        throw new Error('Gang type ID is required for regular fighters');
      }
      
      const { data: result, error } = await supabase.rpc('get_add_fighter_details', {
        p_gang_type_id: params.gangTypeId
      });
      
      if (error) throw error;
      data = result;
    }
    
    // Apply gang variant filtering if variants are provided
    if (params.gangVariants && params.gangVariants.length > 0) {
      data = applyGangVariantFiltering(data, params.gangVariants);
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error in _getFighterTypesUnified:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

// Helper function to apply gang variant logic to fighter types
function applyGangVariantFiltering(fighterTypes: FighterType[], gangVariants: Array<{id: string, variant: string}>): FighterType[] {
  if (!fighterTypes || !gangVariants || gangVariants.length === 0) {
    return fighterTypes;
  }
  
  const variantNames = gangVariants.map(v => v.variant.toLowerCase());
  
  // Apply variant-specific logic
  return fighterTypes.filter(fighterType => {
    // Example variant logic - adjust based on your specific requirements
    // This is where you'd implement the business rules for which variants
    // add/remove which fighter types
    
    // For now, implementing basic filtering logic
    // You'll need to expand this based on your specific variant rules
    
    // Example: If gang has "Outlaw" variant, certain fighter types might be restricted
    if (variantNames.includes('outlaw')) {
      // Add specific outlaw filtering logic here
      // For example, remove law-abiding fighter types
      if (fighterType.alignment?.toLowerCase() === 'law abiding') {
        return false;
      }
    }
    
    // Example: If gang has "Chaos Corrupted" variant, add chaos-specific types
    if (variantNames.includes('chaos corrupted')) {
      // Chaos corrupted gangs might have access to additional fighter types
      // This would typically add types rather than filter them
    }
    
    // Example: If gang has "Skirmish" variant, limit to core types only
    if (variantNames.includes('skirmish')) {
      // Skirmish mode might restrict exotic fighter types
      // Add specific skirmish filtering logic here
    }
    
    // Default: include the fighter type
    return true;
  });
}

// Helper function to generate cache key with variants
function generateCacheKey(gangTypeId: string, gangVariants?: Array<{id: string, variant: string}>, prefix: string = 'fighter-types'): string {
  const baseKey = `${prefix}-${gangTypeId}`;
  
  if (!gangVariants || gangVariants.length === 0) {
    return `${baseKey}-variants-none`;
  }
  
  // Sort variant IDs for consistent cache keys
  const sortedVariantIds = gangVariants
    .map(v => v.id)
    .sort()
    .join('-');
  
  return `${baseKey}-variants-${sortedVariantIds}`;
}

/**
 * Unified server action for getting fighter types
 * Replaces both get_add_fighter_details and get_fighter_types_with_cost RPC calls
 * Note: Cached version for server-side calls
 */
export async function getFighterTypesUnified(params: GetFighterTypesParams): Promise<GetFighterTypesResult> {
  try {
    const supabase = await createClient();
    
    // For gang additions, use a different cache key pattern
    if (params.isGangAddition) {
      const cacheKey = generateCacheKey(params.gangTypeId || 'all', params.gangVariants, 'gang-addition-types');
      
      return unstable_cache(
        async () => {
          return _getFighterTypesUnified(params, supabase);
        },
        [cacheKey],
        {
          tags: ['gang-addition-types', `gang-addition-types-${params.gangTypeId || 'all'}`],
          revalidate: 3600 // 1 hour for reference data
        }
      )();
    } else {
      // For regular fighters, use variant-aware cache key
      if (!params.gangTypeId) {
        return { success: false, error: 'Gang type ID is required for regular fighters' };
      }
      
      const cacheKey = generateCacheKey(params.gangTypeId, params.gangVariants, 'fighter-types');
      
      return unstable_cache(
        async () => {
          return _getFighterTypesUnified(params, supabase);
        },
        [cacheKey],
        {
          tags: ['fighter-types', `fighter-types-${params.gangTypeId}`],
          revalidate: 3600 // 1 hour for reference data
        }
      )();
    }
  } catch (error) {
    console.error('Error in getFighterTypesUnified:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Direct version without caching for client component calls
 * Use this when calling from client components to avoid cookies() conflict
 */
export async function getFighterTypesUncached(params: GetFighterTypesParams): Promise<GetFighterTypesResult> {
  try {
    const supabase = await createClient();
    return _getFighterTypesUnified(params, supabase);
  } catch (error) {
    console.error('Error in getFighterTypesUncached:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Backward-compatible function for regular fighters
 * Maintains the same interface as the existing getFighterTypes function
 * Note: Direct call without caching since these are used from client components
 */
export async function getFighterTypes(gangTypeId: string, gangVariants?: Array<{id: string, variant: string}>): Promise<FighterType[]> {
  const result = await getFighterTypesUnified({ 
    gangTypeId, 
    isGangAddition: false, 
    includeClassId: true,
    gangVariants
  });
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch fighter types');
  }
  
  return result.data || [];
}

/**
 * Function for gang additions - cached version for server components
 * Provides same interface as the RPC call in gang-additions.tsx
 */
export async function getGangAdditionTypes(gangTypeId?: string, gangVariants?: Array<{id: string, variant: string}>): Promise<FighterType[]> {
  const result = await getFighterTypesUnified({ 
    gangTypeId, 
    isGangAddition: true,
    gangVariants
  });
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch gang addition types');
  }
  
  return result.data || [];
}

/**
 * Uncached versions for client component calls
 */
export async function getFighterTypesUncachedClient(gangTypeId: string, gangVariants?: Array<{id: string, variant: string}>): Promise<FighterType[]> {
  const result = await getFighterTypesUncached({ 
    gangTypeId, 
    isGangAddition: false, 
    includeClassId: true,
    gangVariants
  });
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch fighter types');
  }
  
  return result.data || [];
}

export async function getGangAdditionTypesUncachedClient(gangTypeId?: string, gangVariants?: Array<{id: string, variant: string}>): Promise<FighterType[]> {
  const result = await getFighterTypesUncached({ 
    gangTypeId, 
    isGangAddition: true,
    gangVariants
  });
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch gang addition types');
  }
  
  return result.data || [];
}