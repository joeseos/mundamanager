'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData, invalidateGangRating } from '@/utils/cache-tags';
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

    // Fetch effect credits_increase and update rating if vehicle is assigned
    try {
      const [{ data: veh }, { data: eff }] = await Promise.all([
        supabase.from('vehicles').select('fighter_id').eq('id', params.vehicleId).single(),
        supabase.from('fighter_effect_types').select('type_specific_data').eq('id', params.damageId).single()
      ]);
      if (veh?.fighter_id) {
        const delta = (eff?.type_specific_data?.credits_increase || 0) as number;
        if (delta) {
          const { data: ratingRow } = await supabase
            .from('gangs')
            .select('rating')
            .eq('id', params.gangId)
            .single();
          const currentRating = (ratingRow?.rating ?? 0) as number;
          await supabase
            .from('gangs')
            .update({ rating: Math.max(0, currentRating + delta) })
            .eq('id', params.gangId);
          invalidateGangRating(params.gangId);
        }
      }
    } catch (e) {
      console.error('Failed to update rating for vehicle damage:', e);
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