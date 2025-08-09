'use server';

import { createClient } from '@/utils/supabase/server';
import { 
  getEquipmentCategories, 
  getEquipmentWithDiscounts, 
  getFighterEffectsForEquipment,
  getVehicleTypeId,
  formatEquipmentData,
  organizeEquipmentByCategory 
} from '@/app/lib/shared/equipment-data';

/**
 * Server action to get equipment categories
 */
export async function getEquipmentCategoriesAction() {
  try {
    const supabase = await createClient();
    const categories = await getEquipmentCategories(supabase);
    return { success: true, data: categories };
  } catch (error) {
    console.error('Error fetching equipment categories:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch categories' 
    };
  }
}

/**
 * Server action to get equipment with discounts
 */
export async function getEquipmentWithDiscountsAction(params: {
  gang_type_id: string;
  fighter_type_id?: string;
  fighter_type_equipment?: boolean;
  equipment_tradingpost?: boolean;
}) {
  try {
    const supabase = await createClient();
    const rawData = await getEquipmentWithDiscounts(params, supabase);
    const formattedData = formatEquipmentData(rawData);
    const equipmentByCategory = organizeEquipmentByCategory(formattedData);
    
    return { 
      success: true, 
      data: {
        equipment: equipmentByCategory,
        categories: Object.keys(equipmentByCategory)
      }
    };
  } catch (error) {
    console.error('Error fetching equipment:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch equipment' 
    };
  }
}

/**
 * Server action to get fighter effects for equipment
 */
export async function getFighterEffectsForEquipmentAction(equipmentId: string) {
  try {
    const supabase = await createClient();
    const effects = await getFighterEffectsForEquipment(equipmentId, supabase);
    return { success: true, data: effects };
  } catch (error) {
    console.error('Error fetching fighter effects:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch effects' 
    };
  }
}

/**
 * Server action to get vehicle type ID by vehicle type name
 */
export async function getVehicleTypeIdAction(vehicleType: string) {
  try {
    const supabase = await createClient();
    const vehicleTypeId = await getVehicleTypeId(vehicleType, supabase);
    return { success: true, data: vehicleTypeId };
  } catch (error) {
    console.error('Error fetching vehicle type ID:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch vehicle type' 
    };
  }
}
