'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData } from '@/utils/cache-tags';

interface UnassignVehicleParams {
  vehicleId: string;
  gangId: string;
}

interface UnassignVehicleResult {
  success: boolean;
  data?: {
    previous_fighter_id?: string | null;
  };
  error?: string;
}

export async function unassignVehicle(params: UnassignVehicleParams): Promise<UnassignVehicleResult> {
  try {
    const supabase = await createClient();

    // Capture current assignment before unassigning
    const { data: beforeVehicle } = await supabase
      .from('vehicles')
      .select('fighter_id')
      .eq('id', params.vehicleId)
      .single();

    const previousFighterId = beforeVehicle?.fighter_id as string | null | undefined;

    // If already unassigned, nothing to do
    if (!previousFighterId) {
      return { success: true, data: { previous_fighter_id: null } };
    }

    // Unassign vehicle
    const { error: updateError } = await supabase
      .from('vehicles')
      .update({ fighter_id: null, updated_at: new Date().toISOString() })
      .eq('id', params.vehicleId);

    if (updateError) {
      console.error('Error unassigning vehicle:', updateError);
      throw new Error(updateError.message || 'Failed to unassign vehicle');
    }

    // No need to manually update gang rating - fighter cost calculation already excludes unassigned vehicles

    // Invalidate cache for the fighter and gang
    if (previousFighterId) {
      invalidateFighterVehicleData(previousFighterId, params.gangId);
    }

    return {
      success: true,
      data: {
        previous_fighter_id: previousFighterId ?? null,
      }
    };

  } catch (error) {
    console.error('Error in unassignVehicle server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}



