'use server'

import { createClient } from '@/utils/supabase/server';

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
}

interface GetFighterTypesResult {
  success: boolean;
  data?: FighterType[];
  error?: string;
}

// Core function that calls the appropriate SQL function
async function getFighterTypesCore(params: GetFighterTypesParams): Promise<GetFighterTypesResult> {
  try {
    const supabase = await createClient();
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