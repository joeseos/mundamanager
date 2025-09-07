'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
// Removed Next.js cache invalidation - handled by TanStack Query on client side

// Type-safe server function patterns for Next.js + TanStack Query integration
export type ServerFunctionResult<T = unknown> = {
  success: true
  data: T
} | {
  success: false
  error: string
}

export interface ServerFunctionContext {
  user: any  // AuthUser type from supabase
  supabase: any
}

// Helper function to create server function context
async function createServerContext(): Promise<ServerFunctionContext> {
  const supabase = await createClient()
  const user = await getAuthenticatedUser(supabase)
  
  return {
    user,
    supabase
  }
}

export interface AddGangVehicleParams {
  gangId: string;
  vehicleTypeId: string;
  cost: number;
  vehicleName: string;
  baseCost?: number;
}

export interface AddGangVehicleResult {
  vehicle: {
    id: string;
    vehicle_name: string;
    movement: number;
    front: number;
    side: number;
    rear: number;
    hull_points: number;
    handling: number;
    save: number;
    body_slots: number;
    drive_slots: number;
    engine_slots: number;
    special_rules: string[];
    body_slots_occupied: number;
    drive_slots_occupied: number;
    engine_slots_occupied: number;
    vehicle_type_id: string;
    cost: number;
    vehicle_type: string;
    gang_id: string;
    fighter_id: string | null;
    created_at: string;
  };
  gangCredits: number;
  paymentCost: number;
  baseCost: number;
}

export async function addGangVehicle(params: AddGangVehicleParams): Promise<ServerFunctionResult<AddGangVehicleResult>> {
  try {
    const { user, supabase } = await createServerContext();

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);
    
    // Get gang information to verify ownership and get credits
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, credits')
      .eq('id', params.gangId)
      .single();
    
    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    // Check permissions - if not admin, must be gang owner
    if (!isAdmin && gang.user_id !== user.id) {
      throw new Error('You do not have permission to add vehicles to this gang');
    }

    // Get vehicle type details
    const { data: vehicleType, error: vehicleTypeError } = await supabase
      .from('vehicle_types')
      .select('*')
      .eq('id', params.vehicleTypeId)
      .single();

    if (vehicleTypeError || !vehicleType) {
      throw new Error('Vehicle type not found');
    }

    // Calculate costs
    const vehicleCost = params.cost === 0 ? 0 : (params.cost || vehicleType.cost);
    const vehicleBaseCost = params.baseCost !== undefined ? params.baseCost : vehicleCost;

    // Check if gang has enough credits
    if (gang.credits < vehicleCost) {
      throw new Error('Not enough credits');
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
      throw new Error(`Vehicle creation failed: ${vehicleError.message}`);
    }

    // Update gang credits
    const newCredits = gang.credits - vehicleCost;
    const { error: gangUpdateError } = await supabase
      .from('gangs')
      .update({ 
        credits: newCredits,
        last_updated: new Date().toISOString()
      })
      .eq('id', params.gangId);

    if (gangUpdateError) {
      // Clean up if gang update fails
      await supabase.from('vehicles').delete().eq('id', vehicle.id);
      console.error('Gang update error:', gangUpdateError);
      throw new Error(`Gang update failed: ${gangUpdateError.message}`);
    }

    // Cache invalidation is handled by TanStack Query on the client side

    return {
      success: true,
      data: {
        vehicle: {
          id: vehicle.id,
          vehicle_name: vehicle.vehicle_name,
          movement: vehicle.movement,
          front: vehicle.front,
          side: vehicle.side,
          rear: vehicle.rear,
          hull_points: vehicle.hull_points,
          handling: vehicle.handling,
          save: vehicle.save,
          body_slots: vehicle.body_slots,
          drive_slots: vehicle.drive_slots,
          engine_slots: vehicle.engine_slots,
          special_rules: vehicle.special_rules,
          body_slots_occupied: vehicle.body_slots_occupied,
          drive_slots_occupied: vehicle.drive_slots_occupied,
          engine_slots_occupied: vehicle.engine_slots_occupied,
          vehicle_type_id: vehicle.vehicle_type_id,
          cost: vehicle.cost,
          vehicle_type: vehicle.vehicle_type,
          gang_id: vehicle.gang_id,
          fighter_id: vehicle.fighter_id,
          created_at: vehicle.created_at
        },
        gangCredits: newCredits,
        paymentCost: vehicleCost,
        baseCost: vehicleBaseCost
      }
    };
  } catch (error) {
    console.error('Error in addGangVehicle server function:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

// Helper function to get vehicle types for a gang
export async function getGangVehicleTypes(gangId: string): Promise<ServerFunctionResult<any[]>> {
  try {
    const { user, supabase } = await createServerContext();

    // First get the gang's type_id
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('gang_type_id')
      .eq('id', gangId)
      .single();

    if (gangError) {
      throw new Error('Gang not found');
    }

    // Then get vehicle types that match the gang type or are universal (null gang_type_id)
    const { data: vehicleTypes, error } = await supabase
      .from('vehicle_types')
      .select('*')
      .or(`gang_type_id.eq.${gang.gang_type_id},gang_type_id.is.null`)
      .order('vehicle_type');

    if (error) {
      throw new Error('Failed to fetch vehicle types');
    }

    return {
      success: true,
      data: vehicleTypes
    };
  } catch (error) {
    console.error('Error fetching vehicle types:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}