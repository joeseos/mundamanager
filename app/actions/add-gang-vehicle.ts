'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { revalidateTag, revalidatePath } from "next/cache";
import { CACHE_TAGS, invalidateGangCredits } from "@/utils/cache-tags";

interface AddGangVehicleParams {
  gangId: string;
  vehicleTypeId: string;
  cost: number;
  vehicleName: string;
  baseCost?: number;
}

interface AddGangVehicleResult {
  success: boolean;
  error?: string;
  vehicle?: any;
  gangCredits?: number;
  paymentCost?: number;
  baseCost?: number;
}

export async function addGangVehicle(params: AddGangVehicleParams): Promise<AddGangVehicleResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);
    
    // Get gang information to verify ownership and get credits
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, credits')
      .eq('id', params.gangId)
      .single();
    
    if (gangError || !gang) {
      return {
        success: false,
        error: 'Gang not found'
      };
    }

    // Note: Authorization is enforced by RLS policies on vehicles table

    // Get vehicle type details
    const { data: vehicleType, error: vehicleTypeError } = await supabase
      .from('vehicle_types')
      .select('*')
      .eq('id', params.vehicleTypeId)
      .single();

    if (vehicleTypeError || !vehicleType) {
      return {
        success: false,
        error: 'Vehicle type not found'
      };
    }

    // Calculate costs
    const vehicleCost = params.cost === 0 ? 0 : (params.cost || vehicleType.cost);
    const vehicleBaseCost = params.baseCost !== undefined ? params.baseCost : vehicleCost;

    // Check if gang has enough credits (only if vehicle cost > 0)
    if (vehicleCost > 0 && gang.credits < vehicleCost) {
      return {
        success: false,
        error: 'Not enough credits'
      };
    }

    // Create the vehicle in vehicles table
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .insert({
        vehicle_name: (params.vehicleName || vehicleType.vehicle_type).trimEnd(),
        movement: vehicleType.movement,
        front: vehicleType.front,
        side: vehicleType.side,
        rear: vehicleType.rear,
        hull_points: vehicleType.hull_points,
        handling: vehicleType.handling,
        save: vehicleType.save,
        body_slots: vehicleType.body_slots,
        drive_slots: vehicleType.drive_slots,
        engine_slots: vehicleType.engine_slots,
        special_rules: vehicleType.special_rules,
        body_slots_occupied: 0,
        drive_slots_occupied: 0,
        engine_slots_occupied: 0,
        vehicle_type_id: params.vehicleTypeId,
        cost: vehicleBaseCost,
        vehicle_type: vehicleType.vehicle_type,
        gang_id: params.gangId,
        fighter_id: null // Explicitly set as unassigned
      })
      .select()
      .single();

    if (vehicleError) {
      console.error('Vehicle creation error:', vehicleError);
      return {
        success: false,
        error: `Vehicle creation failed: ${vehicleError.message}`
      };
    }

    // Update gang credits and wealth
    const newCredits = gang.credits - vehicleCost;

    // Fetch current wealth for update
    const { data: gangRow } = await supabase
      .from('gangs')
      .select('wealth')
      .eq('id', params.gangId)
      .single();

    const creditsDelta = -vehicleCost; // Negative because credits were spent
    // For unassigned vehicles, wealth delta includes vehicle cost offset
    const wealthDelta = creditsDelta + vehicleBaseCost; // Credits -X, unassigned vehicles +X = net 0

    const { error: gangUpdateError } = await supabase
      .from('gangs')
      .update({
        credits: newCredits,
        wealth: Math.max(0, (gangRow?.wealth ?? 0) + wealthDelta),
        last_updated: new Date().toISOString()
      })
      .eq('id', params.gangId);

    if (gangUpdateError) {
      // Clean up if gang update fails
      await supabase.from('vehicles').delete().eq('id', vehicle.id);
      console.error('Gang update error:', gangUpdateError);
      return {
        success: false,
        error: `Gang update failed: ${gangUpdateError.message}`
      };
    }

    // Invalidate relevant cache tags
    invalidateGangCredits(params.gangId);
    revalidateTag(CACHE_TAGS.BASE_GANG_VEHICLES(params.gangId));
    // NOTE: No need to invalidate COMPOSITE_GANG_FIGHTERS_LIST - gang page uses BASE_GANG_VEHICLES

    // Also invalidate computed gang vehicle count
    revalidateTag(CACHE_TAGS.COMPUTED_GANG_VEHICLE_COUNT(params.gangId));

    return {
      success: true,
      vehicle: {
        ...vehicle,
        gang_credits: newCredits,
        payment_cost: vehicleCost,
        base_cost: vehicleBaseCost
      },
      gangCredits: newCredits,
      paymentCost: vehicleCost,
      baseCost: vehicleBaseCost
    };
  } catch (error) {
    console.error('Error in addGangVehicle server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

// Helper function to get vehicle types for a gang
export async function getGangVehicleTypes(gangId: string) {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // First get the gang's type_id
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('gang_type_id')
      .eq('id', gangId)
      .single();

    if (gangError) {
      return {
        success: false,
        error: 'Gang not found'
      };
    }

    // Then get vehicle types that match the gang type or are universal (null gang_type_id)
    const { data: vehicleTypes, error } = await supabase
      .from('vehicle_types')
      .select('*')
      .or(`gang_type_id.eq.${gang.gang_type_id},gang_type_id.is.null`)
      .order('vehicle_type');

    if (error) {
      return {
        success: false,
        error: 'Failed to fetch vehicle types'
      };
    }

    return {
      success: true,
      vehicleTypes
    };
  } catch (error) {
    console.error('Error fetching vehicle types:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}