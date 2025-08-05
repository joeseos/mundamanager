'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

interface AddVehicleDamageParams {
  vehicleId: string;
  fighterId: string;
  gangId: string;
  damageId: string;
  damageName: string;
}

interface AddVehicleDamageResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function addVehicleDamage(params: AddVehicleDamageParams): Promise<AddVehicleDamageResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Add the vehicle damage using the RPC function
    const { data, error } = await supabase
      .rpc('add_vehicle_effect', {
        in_vehicle_id: params.vehicleId,
        in_fighter_effect_type_id: params.damageId,
        in_user_id: user.id,
        in_fighter_effect_category_id: 'a993261a-4172-4afb-85bf-f35e78a1189f' // VEHICLE_DAMAGE_CATEGORY_ID
      });

    if (error) {
      console.error('Error adding vehicle damage:', error);
      throw new Error(error.message || 'Failed to add vehicle damage');
    }

    // Invalidate cache for the fighter and gang
    invalidateFighterVehicleData(params.fighterId, params.gangId);

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('Error in addVehicleDamage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 