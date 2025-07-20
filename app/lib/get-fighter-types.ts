'use server'

import { createClient } from '@/utils/supabase/server';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { gangVariantFighterModifiers } from '@/utils/gangVariantMap';

// Gang variant interface
export interface GangVariant {
  id: string;
  variant: string;
}

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
  gangVariants?: GangVariant[];
  gangId?: string; // For caching purposes
}

interface GetFighterTypesResult {
  success: boolean;
  data?: FighterType[];
  error?: string;
}

// Core function that calls the appropriate SQL function
async function getFighterTypesCore(params: GetFighterTypesParams, supabase?: any): Promise<GetFighterTypesResult> {
  try {
    const client = supabase || await createClient();
    let data;
    
    if (params.isGangAddition) {
      // Use get_fighter_types_with_cost for gang additions
      const { data: result, error } = await client.rpc('get_fighter_types_with_cost', {
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
      
      const { data: result, error } = await client.rpc('get_add_fighter_details', {
        p_gang_type_id: params.gangTypeId
      });
      
      if (error) throw error;
      data = result;
    }
    
    // Process gang variants if provided (exact same logic as gang.tsx)
    if (params.gangVariants && params.gangVariants.length > 0 && !params.isGangAddition) {
      for (const variant of params.gangVariants) {
        const variantModifier = gangVariantFighterModifiers[variant.id];
        if (!variantModifier) continue;

        // Apply variant rules (like removing Leaders)
        if (variantModifier.removeLeaders) {
          data = data.filter((type: any) => type.fighter_class !== 'Leader');
        }

        // Fetch variant-specific fighter types and merge
        const { data: variantData, error: variantError } = await client.rpc('get_add_fighter_details', {
          p_gang_type_id: variantModifier.variantGangTypeId
        });
        
        if (!variantError && variantData) {
          // Mark these as gang variant fighter types
          const markedVariantData = variantData.map((type: any) => ({
            ...type,
            is_gang_variant: true,
            gang_variant_name: variant.variant
          }));
          data = [...data, ...markedVariantData];
        }
      }
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error in getFighterTypesCore:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Get fighter types for regular fighters
 * Used by client components in dropdown menus
 */
export async function getFighterTypes(gangTypeId: string): Promise<FighterType[]> {
  const result = await getFighterTypesCore({ 
    gangTypeId, 
    isGangAddition: false, 
    includeClassId: true 
  });
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch fighter types');
  }
  
  return result.data || [];
}

/**
 * Get fighter types for gang additions
 * Used by client components in dropdown menus
 */
export async function getGangAdditionTypes(gangTypeId?: string): Promise<FighterType[]> {
  const result = await getFighterTypesCore({ 
    gangTypeId, 
    isGangAddition: true 
  });
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch gang addition types');
  }
  
  return result.data || [];
}

/**
 * Alternative names for client component calls (backward compatibility)
 */
export async function getFighterTypesUncachedClient(gangTypeId: string): Promise<FighterType[]> {
  return getFighterTypes(gangTypeId);
}

export async function getGangAdditionTypesUncachedClient(gangTypeId?: string): Promise<FighterType[]> {
  return getGangAdditionTypes(gangTypeId);
}

/**
 * Get fighter types for a gang including variants (cached)
 * This is the new recommended function for server components
 */
export async function getFighterTypesForGang(
  gangId: string, 
  gangTypeId: string, 
  gangVariants: GangVariant[] = [],
  supabase?: any
): Promise<FighterType[]> {
  return unstable_cache(
    async (supabaseParam) => {
      const result = await getFighterTypesCore({ 
        gangTypeId, 
        isGangAddition: false, 
        includeClassId: true,
        gangVariants,
        gangId
      }, supabaseParam);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch fighter types for gang');
      }
      
      return result.data || [];
    },
    [`fighter-types-gang-${gangId}-${gangTypeId}`],
    {
      tags: [CACHE_TAGS.FIGHTER_TYPES_FOR_GANG(gangId)]
    }
  )(supabase);
}

/**
 * Get gang addition types for a gang (cached)
 * This is the new recommended function for server components
 */
export async function getGangAdditionTypesForGang(
  gangId: string,
  gangTypeId?: string
): Promise<FighterType[]> {
  return unstable_cache(
    async () => {
      const result = await getFighterTypesCore({ 
        gangTypeId, 
        isGangAddition: true,
        gangId
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch gang addition types');
      }
      
      return result.data || [];
    },
    [`gang-addition-types-${gangId}-${gangTypeId || 'all'}`],
    {
      tags: [CACHE_TAGS.FIGHTER_TYPES_FOR_GANG(gangId)]
    }
  )();
}

/**
 * Enhanced function that returns organized fighter types data for UI components
 * Includes both display types and sub-types organized for dropdowns
 */
export async function getFighterTypesForModal(
  gangId: string,
  gangTypeId: string,
  gangVariants: GangVariant[] = [],
  supabase?: any
) {
  const allFighterTypes = await getFighterTypesForGang(gangId, gangTypeId, gangVariants, supabase);
  
  // Create a map to group fighters by type+class and find default/cheapest for each
  const typeClassDisplayMap = new Map();
  const subTypesByTypeClass = new Map();
  
  allFighterTypes.forEach((fighter) => {
    const key = `${fighter.fighter_type}-${fighter.fighter_class}`;
    
    // Store display type (one per type+class combination)
    if (!typeClassDisplayMap.has(key)) {
      typeClassDisplayMap.set(key, fighter);
    } else {
      const current = typeClassDisplayMap.get(key);
      
      // If this fighter has no sub-type, prefer it as default for display
      const hasSubType = fighter.sub_type && Object.keys(fighter.sub_type).length > 0;
      const currentHasSubType = current.sub_type && Object.keys(current.sub_type).length > 0;
      
      if (!hasSubType && currentHasSubType) {
        typeClassDisplayMap.set(key, fighter);
      }
      // Otherwise, take the cheaper option
      else if (fighter.total_cost < current.total_cost) {
        typeClassDisplayMap.set(key, fighter);
      }
    }
    
    // Store this fighter as a potential sub-type
    if (!subTypesByTypeClass.has(key)) {
      subTypesByTypeClass.set(key, []);
    }
    
    // Add sub-types that have meaningful names
    const subTypeList = subTypesByTypeClass.get(key);
    const existingSubType = subTypeList.find((st: any) => st.id === fighter.id);
    
    if (!existingSubType && fighter.sub_type?.sub_type_name) {
      subTypeList.push({
        id: fighter.sub_type.id || fighter.id,
        fighter_sub_type: fighter.sub_type.sub_type_name,
        cost: fighter.cost || fighter.total_cost,
        fighter_type_id: fighter.id,
        fighter_type_name: fighter.fighter_type,
        fighter_class_name: fighter.fighter_class
      });
    }
  });
  
  // Create the final fighter types array for the dropdown
  const displayTypes = Array.from(typeClassDisplayMap.values())
    .map((fighter) => ({
      id: fighter.id,
      fighter_type: fighter.fighter_type,
      fighter_class: fighter.fighter_class,
      fighter_class_id: fighter.fighter_class_id || '',
      special_rules: fighter.special_rules || [],
      gang_type_id: fighter.gang_type_id,
      total_cost: fighter.total_cost,
      typeClassKey: `${fighter.fighter_type}-${fighter.fighter_class}`,
      is_gang_variant: fighter.is_gang_variant || false,
      gang_variant_name: fighter.gang_variant_name || undefined
    }));

  return {
    displayTypes,
    subTypesByTypeClass
  };
}