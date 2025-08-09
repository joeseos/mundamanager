import { unstable_cache } from 'next/cache';

// =============================================================================
// TYPES - Equipment data interfaces
// =============================================================================

export interface EquipmentCategory {
  id: string;
  category_name: string;
}

export interface RawEquipmentData {
  id: string;
  equipment_name: string;
  trading_post_category: string;
  availability: string | null;
  base_cost: number;
  discounted_cost: number;
  adjusted_cost: number;
  equipment_category: string;
  equipment_type: 'weapon' | 'wargear' | 'vehicle_upgrade';
  created_at: string;
  weapon_profiles?: any[];
  fighter_type_equipment: boolean;
  fighter_type_equipment_tp: boolean;
  fighter_weapon_id?: string;
  fighter_equipment_id: string;
  master_crafted?: boolean;
  is_custom: boolean;
  vehicle_upgrade_slot?: string;
}

// =============================================================================
// BASE DATA FUNCTIONS - Raw database queries with infinite cache
// =============================================================================

/**
 * Get equipment categories with infinite cache until admin updates
 * Cache: equipment-categories tag
 */
export const getEquipmentCategories = async (supabase: any): Promise<EquipmentCategory[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('equipment_categories')
        .select('id,category_name')
        .order('category_name');

      if (error) throw error;
      return data || [];
    },
    ['equipment-categories'],
    {
      tags: ['equipment-categories'],
      revalidate: false // Infinite cache until admin updates
    }
  )();
};

/**
 * Get equipment with discounts using RPC with infinite cache until admin updates
 * Cache: equipment-data tag with unique key per parameter combination
 */
export const getEquipmentWithDiscounts = async (params: any, supabase: any): Promise<RawEquipmentData[]> => {
  // Create stable cache key based on parameters
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((result: any, key) => {
      result[key] = params[key];
      return result;
    }, {});
  
  const cacheKey = `equipment-${JSON.stringify(sortedParams)}`;
  
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .rpc('get_equipment_with_discounts', params);

      if (error) throw error;
      return data || [];
    },
    [cacheKey],
    {
      tags: ['equipment-data'],
      revalidate: false // Infinite cache until admin updates
    }
  )();
};

/**
 * Get fighter effects for equipment with infinite cache until admin updates
 * Cache: equipment-effects tag
 */
export const getFighterEffectsForEquipment = async (equipmentId: string, supabase: any): Promise<any[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_effect_types')
        .select(`
          id,
          effect_name,
          fighter_effect_category_id,
          type_specific_data,
          fighter_effect_type_modifiers (
            id,
            stat_name,
            default_numeric_value
          )
        `)
        .eq('type_specific_data->>equipment_id', equipmentId);

      if (error) throw error;
      return data || [];
    },
    [`equipment-effects-${equipmentId}`],
    {
      tags: ['equipment-effects'],
      revalidate: false // Infinite cache until admin updates
    }
  )();
};

/**
 * Get vehicle type ID by vehicle type name with infinite cache
 * Cache: vehicle-types tag
 */
export const getVehicleTypeId = async (vehicleType: string, supabase: any): Promise<string | null> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('vehicle_types')
        .select('id')
        .eq('vehicle_type', vehicleType)
        .single();

      if (error) return null;
      return data?.id || null;
    },
    [`vehicle-type-${vehicleType}`],
    {
      tags: ['vehicle-types'],
      revalidate: false // Infinite cache - vehicle types rarely change
    }
  )();
};

// =============================================================================
// HELPER FUNCTIONS - Data formatting and processing
// =============================================================================

/**
 * Format raw equipment data into the expected Equipment interface
 */
export const formatEquipmentData = (rawData: RawEquipmentData[]) => {
  return rawData
    .map((item) => ({
      ...item,
      equipment_id: item.id,
      fighter_equipment_id: '',
      cost: item.adjusted_cost,
      base_cost: item.base_cost,
      adjusted_cost: item.adjusted_cost,
      equipment_type: item.equipment_type as 'weapon' | 'wargear' | 'vehicle_upgrade',
      fighter_weapon_id: item.fighter_weapon_id || undefined,
      master_crafted: item.master_crafted || false,
      is_custom: item.is_custom,
      vehicle_upgrade_slot: item.vehicle_upgrade_slot || undefined
    }))
    // Remove duplicates based on equipment_id
    .filter((item, index, array) => 
      array.findIndex(i => i.equipment_id === item.equipment_id) === index
    )
    .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));
};

/**
 * Organize equipment by category with special sorting for Vehicle Upgrades
 */
export const organizeEquipmentByCategory = (formattedData: any[]) => {
  const equipmentByCategory: Record<string, any[]> = {};
  
  formattedData.forEach(item => {
    const category = item.equipment_category;
    if (!equipmentByCategory[category]) {
      equipmentByCategory[category] = [];
    }
    equipmentByCategory[category].push(item);
  });

  // Sort Vehicle Upgrades by slot first, then alphabetically
  if (equipmentByCategory['Vehicle Upgrades']) {
    equipmentByCategory['Vehicle Upgrades'].sort((a, b) => {
      // Define slot order - items without slot info come first (0)
      const slotOrder = { 'Body': 1, 'Drive': 2, 'Engine': 3 };
      
      // Get slot values, treating null/undefined as 0 (first)
      const aSlot = a.vehicle_upgrade_slot || '';
      const bSlot = b.vehicle_upgrade_slot || '';
      const aOrder = slotOrder[aSlot as keyof typeof slotOrder] || 0;
      const bOrder = slotOrder[bSlot as keyof typeof slotOrder] || 0;
      
      // Sort by slot first
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // Then sort alphabetically
      return a.equipment_name.localeCompare(b.equipment_name);
    });
  }

  return equipmentByCategory;
};
