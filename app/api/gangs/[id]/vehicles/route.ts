import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
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

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { vehicleTypeId, cost, vehicleName } = await request.json();
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
    const vehicleCost = cost || vehicleType.cost;
    if (gang.credits < vehicleCost) {
      return NextResponse.json(
        { error: 'Not enough credits' },
        { status: 400 }
      );
    }

    // First, create the stash item
    const { data: stashItem, error: stashError } = await supabase
      .from('gang_stash')
      .insert({
        gang_id: gangId,
        cost: vehicleCost,
      })
      .select()
      .single();

    if (stashError) {
      return NextResponse.json(
        { error: `Stash error: ${stashError.message}` },
        { status: 500 }
      );
    }

    // Then create the vehicle with the custom name, type and cost
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .insert({
        vehicle_type_id: vehicleTypeId,
        vehicle_name: vehicleName || vehicleType.vehicle_type,
        vehicle_type: vehicleType.vehicle_type,
        cost: vehicleCost,
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
        stash_id: stashItem.id
      })
      .select()
      .single();

    if (vehicleError) {
      // Clean up stash if vehicle creation fails
      await supabase.from('gang_stash').delete().eq('id', stashItem.id);
      return NextResponse.json(
        { error: `Vehicle creation error: ${vehicleError.message}` },
        { status: 500 }
      );
    }

    // Update the stash item with the vehicle_id
    const { error: stashUpdateError } = await supabase
      .from('gang_stash')
      .update({ vehicle_id: vehicle.id })
      .eq('id', stashItem.id);

    if (stashUpdateError) {
      // Clean up both records if update fails
      await Promise.all([
        supabase.from('vehicles').delete().eq('id', vehicle.id),
        supabase.from('gang_stash').delete().eq('id', stashItem.id)
      ]);
      return NextResponse.json(
        { error: `Stash update error: ${stashUpdateError.message}` },
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
      // Clean up everything if gang update fails
      await Promise.all([
        supabase.from('vehicles').delete().eq('id', vehicle.id),
        supabase.from('gang_stash').delete().eq('id', stashItem.id)
      ]);
      return NextResponse.json(
        { error: `Gang update error: ${gangUpdateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...vehicle,
      stash_id: stashItem.id,
      gang_credits: gang.credits - vehicleCost
    });
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown server error' },
      { status: 500 }
    );
  }
} 