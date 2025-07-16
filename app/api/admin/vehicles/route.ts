import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { checkAdmin } from '@/utils/auth';

export async function GET(request: Request) {
  const supabase = await createClient();
  
  // Check admin authorization
  const isAdmin = await checkAdmin(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { searchParams } = new URL(request.url);
  const fetch_type = searchParams.get('fetch_type');
  const vehicle_id = searchParams.get('vehicle_id');

  try {
    // Fetch specific vehicle details
    if (vehicle_id) {
      const { data: vehicleDetails, error } = await supabase
        .from('vehicle_types')
        .select(`
          *,
          fighter_type_equipment!vehicle_type_id (
            equipment_id
          )
        `)
        .eq('id', vehicle_id)
        .single();

      if (error) throw error;

      // Transform equipment list data
      if (vehicleDetails) {
        vehicleDetails.equipment_list = vehicleDetails.fighter_type_equipment?.map(
          (item: { equipment_id: string }) => item.equipment_id
        ) || [];
        delete vehicleDetails.fighter_type_equipment;
      }

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
  const supabase = await createClient();

  // Check admin authorization
  const isAdmin = await checkAdmin(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
      gang_type_id: vehicleData.gang_type_id === "0" ? null : parseInt(vehicleData.gang_type_id),
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
  const supabase = await createClient();

  // Check admin authorization
  const isAdmin = await checkAdmin(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const vehicleData = await request.json();
    const vehicle_id = vehicleData.id;
    const equipment_list = vehicleData.equipment_list || [];

    console.log('Received vehicle data:', {
      ...vehicleData,
      equipment_list
    });

    if (!vehicle_id || typeof vehicle_id !== 'string') {
      console.log('Missing or invalid vehicle ID');
      return NextResponse.json(
        { error: 'Valid vehicle ID (UUID) is required' },
        { status: 400 }
      );
    }

    // Format the data
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

    // First update the vehicle type
    const { data: updatedVehicle, error: updateError } = await supabase
      .from('vehicle_types')
      .update(formattedData)
      .eq('id', vehicle_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Then handle equipment associations
    // 1. Delete existing equipment associations for this vehicle
    const { error: deleteError } = await supabase
      .from('fighter_type_equipment')
      .delete()
      .eq('vehicle_type_id', vehicle_id);

    if (deleteError) throw deleteError;

    // 2. Insert new equipment associations if there are any
    if (equipment_list.length > 0) {
      const equipmentAssociations = equipment_list.map((equipment_id: string) => ({
        equipment_id,
        fighter_type_id: null,
        vehicle_type_id: vehicle_id
      }));

      const { error: insertError } = await supabase
        .from('fighter_type_equipment')
        .insert(equipmentAssociations);

      if (insertError) throw insertError;
    }

    // Return the updated vehicle with its equipment list
    return NextResponse.json({
      ...updatedVehicle,
      equipment_list
    });

  } catch (error) {
    console.error('Error in PUT:', error);
    return NextResponse.json(
      { error: 'Failed to update vehicle type', details: error },
      { status: 500 }
    );
  }
} 