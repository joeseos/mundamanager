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
  const supabase = createClient();
  const gangId = params.id;
  
  try {
    const { vehicleTypeId } = await request.json();
    console.log('Request params:', { gangId, vehicleTypeId });

    // Get vehicle type details and gang's current credits
    const [vehicleTypeResult, gangResult] = await Promise.all([
      supabase
        .from('vehicle_types')
        .select('*')
        .eq('id', vehicleTypeId)
        .single(),
      supabase
        .from('gangs')
        .select('credits')
        .eq('id', gangId)
        .single()
    ]);

    console.log('Raw query results:', {
      vehicleTypeResult,
      gangResult
    });

    if (vehicleTypeResult.error) {
      return NextResponse.json(
        { error: `Vehicle type fetch error: ${vehicleTypeResult.error.message}` },
        { status: 500 }
      );
    }

    if (gangResult.error) {
      return NextResponse.json(
        { error: `Gang fetch error: ${gangResult.error.message}` },
        { status: 500 }
      );
    }

    const vehicleType = vehicleTypeResult.data;
    const gang = gangResult.data;

    if (!vehicleType) {
      return NextResponse.json(
        { error: `Vehicle type not found: ${vehicleTypeId}` },
        { status: 404 }
      );
    }

    if (!gang) {
      return NextResponse.json(
        { error: `Gang not found: ${gangId}` },
        { status: 404 }
      );
    }

    // Check if gang has enough credits
    if (gang.credits < vehicleType.cost) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${vehicleType.cost}, have ${gang.credits}` },
        { status: 400 }
      );
    }

    // First create the vehicle
    const vehicleData = {
      movement: vehicleType.movement || 0,
      front: vehicleType.front || 0,
      side: vehicleType.side || 0,
      rear: vehicleType.rear || 0,
      hull_points: vehicleType.hull_points || 0,
      handling: vehicleType.handling || 0,
      save: vehicleType.save || 0,
      body_slots: vehicleType.body_slots || 0,
      drive_slots: vehicleType.drive_slots || 0,
      engine_slots: vehicleType.engine_slots || 0,
      special_rules: vehicleType.special_rules || [],
      body_slots_occupied: 0,
      drive_slots_occupied: 0,
      engine_slots_occupied: 0,
      vehicle_name: vehicleType.vehicle_type
    };

    console.log('Attempting to insert vehicle with data:', vehicleData);

    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .insert(vehicleData)
      .select()
      .single();

    if (vehicleError) {
      console.error('Vehicle insert error:', vehicleError);
      return NextResponse.json(
        { error: `Vehicle insert error: ${vehicleError.message}` },
        { status: 500 }
      );
    }

    // Then create the gang_stash entry
    const { data: stashItem, error: stashError } = await supabase
      .from('gang_stash')
      .insert({
        gang_id: gangId,
        cost: vehicleType.cost,
        vehicle_id: vehicle.id
      })
      .select()
      .single();

    if (stashError) {
      // Clean up vehicle if stash creation fails
      await supabase
        .from('vehicles')
        .delete()
        .eq('id', vehicle.id);

      console.error('Stash insert error:', stashError);
      return NextResponse.json(
        { error: `Stash insert error: ${stashError.message}` },
        { status: 500 }
      );
    }

    // Update the vehicle with the stash_id
    const { error: updateError } = await supabase
      .from('vehicles')
      .update({ stash_id: stashItem.id })
      .eq('id', vehicle.id);

    if (updateError) {
      // Clean up both entries
      await Promise.all([
        supabase.from('vehicles').delete().eq('id', vehicle.id),
        supabase.from('gang_stash').delete().eq('id', stashItem.id)
      ]);

      return NextResponse.json(
        { error: `Vehicle update error: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Update gang credits
    const { error: gangUpdateError } = await supabase
      .from('gangs')
      .update({ 
        credits: gang.credits - vehicleType.cost,
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
      cost: vehicleType.cost,
      gang_credits: gang.credits - vehicleType.cost
    });
  } catch (error) {
    console.error('Detailed error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown server error' },
      { status: 500 }
    );
  }
} 