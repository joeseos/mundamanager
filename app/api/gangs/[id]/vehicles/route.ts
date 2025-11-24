import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const gangId = params.id;

  try {
    // First get the gang's type_id
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('gang_type_id')
      .eq('id', gangId)
      .single();

    if (gangError) throw gangError;

    // Then get vehicle types that match the gang type or are universal (null gang_type_id)
    const { data: vehicleTypes, error } = await supabase
      .from('vehicle_types')
      .select('*')
      .or(`gang_type_id.eq.${gang.gang_type_id},gang_type_id.is.null`)
      .order('vehicle_type');

    if (error) throw error;

    return NextResponse.json(vehicleTypes);
  } catch (error) {
    console.error('Error fetching vehicle types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vehicle types' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const userId = await getUserIdFromClaims(supabase);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { vehicleTypeId, cost, vehicleName, baseCost } = await request.json();
    const gangId = params.id;

    // Get gang details to check credits
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('credits')
      .eq('id', gangId)
      .single();

    if (gangError) {
      return NextResponse.json(
        { error: `Gang fetch error: ${gangError.message}` },
        { status: 500 }
      );
    }

    // Get vehicle type details
    const { data: vehicleType, error: vehicleTypeError } = await supabase
      .from('vehicle_types')
      .select('*')
      .eq('id', vehicleTypeId)
      .single();

    if (vehicleTypeError) {
      return NextResponse.json(
        { error: `Vehicle type error: ${vehicleTypeError.message}` },
        { status: 500 }
      );
    }

    // Check if gang has enough credits
    const vehicleCost = cost === 0 ? 0 : (cost || vehicleType.cost);
    if (gang.credits < vehicleCost) {
      return NextResponse.json(
        { error: 'Not enough credits' },
        { status: 400 }
      );
    }

    // Use the baseCost for the vehicle's cost property if it's provided, otherwise use the payment cost
    const vehicleBaseCost = baseCost !== undefined ? baseCost : vehicleCost;

    // Create the vehicle in vehicles table
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .insert({
        vehicle_name: (vehicleName || vehicleType.vehicle_type).trimEnd(),
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
        vehicle_type_id: vehicleTypeId,
        cost: vehicleBaseCost,
        vehicle_type: vehicleType.vehicle_type,
        gang_id: gangId
      })
      .select()
      .single();

    if (vehicleError) {
      return NextResponse.json(
        { error: `Vehicle creation error: ${vehicleError.message}` },
        { status: 500 }
      );
    }

    // Update gang credits
    const { error: gangUpdateError } = await supabase
      .from('gangs')
      .update({ 
        credits: gang.credits - vehicleCost,
        last_updated: new Date().toISOString()
      })
      .eq('id', gangId);

    if (gangUpdateError) {
      // Clean up if gang update fails
      await supabase.from('vehicles').delete().eq('id', vehicle.id);
      return NextResponse.json(
        { error: `Gang update error: ${gangUpdateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...vehicle,
      gang_credits: gang.credits - vehicleCost,
      payment_cost: vehicleCost,
      base_cost: vehicleBaseCost
    });
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { vehicleId, fighterId } = await request.json();
    const supabase = await createClient();
    
    // Get the current user
    const userId = await getUserIdFromClaims(supabase);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user has access to this gang
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', params.id)
      .single();

    if (gangError || !gangData || gangData.user_id !== userId) {
      return NextResponse.json(
        { error: 'Gang not found or access denied' },
        { status: 404 }
      );
    }

    // Update the vehicle with the fighter_id
    const { error: updateError } = await supabase
      .from('vehicles')
      .update({ fighter_id: fighterId })
      .eq('id', vehicleId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update vehicle' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const supabase = await createClient();

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get the vehicle ID from the request
    const { vehicleId } = await request.json();

    // Delete the vehicle - RLS will handle ownership checks
    const { error: deleteError } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', vehicleId);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete vehicle' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 