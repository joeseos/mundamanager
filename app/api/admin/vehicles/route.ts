import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createClient();
  
  const { searchParams } = new URL(request.url);
  const fetch_type = searchParams.get('fetch_type');
  const vehicle_id = searchParams.get('vehicle_id');

  try {
    // Fetch specific vehicle details
    if (vehicle_id) {
      const { data: vehicleDetails, error } = await supabase
        .from('vehicle_types')
        .select('*')
        .eq('id', vehicle_id)
        .single();

      if (error) throw error;

      // If we have a vehicle with a gang_type_id, fetch the gang type details
      if (vehicleDetails && vehicleDetails.gang_type_id) {
        const { data: gangType, error: gangError } = await supabase
          .from('gang_types')
          .select('gang_type_id, gang_type')
          .eq('gang_type_id', vehicleDetails.gang_type_id)
          .single();

        if (!gangError && gangType) {
          vehicleDetails.gang_types = gangType;
        }
      }

      return NextResponse.json(vehicleDetails);
    }

    // Fetch vehicle types list
    if (fetch_type === 'vehicle_types') {
      const { data: vehicleTypes, error } = await supabase
        .from('vehicle_types')
        .select('id, vehicle_type')
        .order('vehicle_type');

      if (error) throw error;
      return NextResponse.json(vehicleTypes);
    }

    // Fetch gang types list (default)
    const { data: gangTypes, error } = await supabase
      .from('gang_types')
      .select('gang_type_id, gang_type')
      .order('gang_type');

    if (error) throw error;
    return NextResponse.json(gangTypes);
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = createClient();

  try {
    const vehicleData = await request.json();
    
    // Convert string values to numbers for numeric fields
    const formattedData = {
      ...vehicleData,
      cost: parseInt(vehicleData.cost),
      movement: parseInt(vehicleData.movement),
      front: parseInt(vehicleData.front),
      side: parseInt(vehicleData.side),
      rear: parseInt(vehicleData.rear),
      hull_points: parseInt(vehicleData.hull_points),
      body_slots: parseInt(vehicleData.body_slots),
      drive_slots: parseInt(vehicleData.drive_slots),
      engine_slots: parseInt(vehicleData.engine_slots),
      gang_type_id: vehicleData.gang_type_id === "0" ? null : vehicleData.gang_type_id,
      // Initialize occupied slots to 0
      body_slots_occupied: 0,
      drive_slots_occupied: 0,
      engine_slots_occupied: 0
    };

    const { data, error } = await supabase
      .from('vehicle_types')
      .insert([formattedData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating vehicle type:', error);
    return NextResponse.json(
      { error: 'Failed to create vehicle type' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const supabase = createClient();

  try {
    const vehicleData = await request.json();
    const vehicle_id = vehicleData.id;

    console.log('Received vehicle data:', vehicleData);

    if (!vehicle_id || typeof vehicle_id !== 'string') {
      console.log('Missing or invalid vehicle ID');
      return NextResponse.json(
        { error: 'Valid vehicle ID (UUID) is required' },
        { status: 400 }
      );
    }

    // Format the data similar to POST but without the occupied slots
    const formattedData = {
      cost: parseInt(vehicleData.cost),
      movement: parseInt(vehicleData.movement),
      front: parseInt(vehicleData.front),
      side: parseInt(vehicleData.side),
      rear: parseInt(vehicleData.rear),
      hull_points: parseInt(vehicleData.hull_points),
      body_slots: parseInt(vehicleData.body_slots),
      drive_slots: parseInt(vehicleData.drive_slots),
      engine_slots: parseInt(vehicleData.engine_slots),
      gang_type_id: vehicleData.gang_type_id === "0" ? null : vehicleData.gang_type_id,
      handling: vehicleData.handling,
      save: vehicleData.save,
      special_rules: vehicleData.special_rules,
      vehicle_type: vehicleData.vehicle_type
    };

    console.log('Formatted data:', formattedData);
    console.log('Updating vehicle with UUID:', vehicle_id);

    try {
      const { data, error } = await supabase
        .from('vehicle_types')
        .update(formattedData)
        .eq('id', vehicle_id.toString()) // Ensure ID is a string
        .select()
        .single();

      if (error) {
        console.error('Supabase update error:', error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      if (!data) {
        console.log('No data returned after update');
        return NextResponse.json(
          { error: 'Vehicle not found' },
          { status: 404 }
        );
      }

      console.log('Update successful, returning data:', data);
      return NextResponse.json(data);
    } catch (supabaseError) {
      console.error('Supabase operation error:', supabaseError);
      throw supabaseError;
    }

  } catch (error) {
    console.error('Top level error in PUT:', error);
    return NextResponse.json(
      { error: 'Failed to update vehicle type', details: error },
      { status: 500 }
    );
  }
} 