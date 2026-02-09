import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { checkAdmin } from '@/utils/auth';

// TypeScript interfaces
interface FighterTypeEquipmentItem {
  id: string;
  equipment_id: string;
  gang_origin_id?: string | null;
  gang_type_id?: string | null;
}

interface GangOriginEquipmentItem {
  equipment_id: string;
  gang_origin_id: string;
}

interface GangTypeEquipmentItem {
  equipment_id: string;
  gang_type_id: string;
}

interface HardpointTemplate {
  operated_by: 'crew' | 'passenger' | '';
  arcs: string[];
  location: string;
}

interface VehicleFormData {
  id: string;
  cost?: string;
  movement?: string;
  front?: string;
  side?: string;
  rear?: string;
  hull_points?: string;
  handling?: string;
  save?: string;
  body_slots?: string;
  drive_slots?: string;
  engine_slots?: string;
  vehicle_type?: string;
  gang_type_id?: string;
  special_rules?: string;
  equipment_list?: string[];
  gang_origin_equipment?: GangOriginEquipmentItem[];
  gang_type_equipment?: GangTypeEquipmentItem[];
  hardpoints?: HardpointTemplate[];
}


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
            id,
            equipment_id,
            gang_origin_id,
            gang_type_id
          )
        `)
        .eq('id', vehicle_id)
        .single();

      if (error) throw error;

        // Transform equipment list data
        if (vehicleDetails) {
          vehicleDetails.equipment_list = vehicleDetails.fighter_type_equipment
            ?.filter((item: FighterTypeEquipmentItem) => !item.gang_origin_id && !item.gang_type_id) // Only equipment without gang_origin_id or gang_type_id
            .map((item: FighterTypeEquipmentItem) => item.equipment_id) || [];

          // Transform gang origin equipment data
          const gangOriginEquipment = vehicleDetails.fighter_type_equipment
            ?.filter((item: FighterTypeEquipmentItem) => item.gang_origin_id)
            .map((item: FighterTypeEquipmentItem) => ({
              id: item.id,
              equipment_id: item.equipment_id,
              gang_origin_id: item.gang_origin_id!
            })) || [];

          // Transform gang type equipment data
          const gangTypeEquipment = vehicleDetails.fighter_type_equipment
            ?.filter((item: FighterTypeEquipmentItem) => item.gang_type_id && !item.gang_origin_id)
            .map((item: FighterTypeEquipmentItem) => ({
              id: item.id,
              equipment_id: item.equipment_id,
              gang_type_id: item.gang_type_id!
            })) || [];

        // Fetch equipment names and gang origin names for gang origin equipment
        if (gangOriginEquipment.length > 0) {
          const equipmentIds = gangOriginEquipment.map((item: { equipment_id: string; gang_origin_id: string }) => item.equipment_id);
          const gangOriginIds = gangOriginEquipment.map((item: { equipment_id: string; gang_origin_id: string }) => item.gang_origin_id);

          const [equipmentResult, gangOriginResult] = await Promise.all([
            supabase
              .from('equipment')
              .select('id, equipment_name')
              .in('id', equipmentIds),
            supabase
              .from('gang_origins')
              .select('id, origin_name')
              .in('id', gangOriginIds)
          ]);

          if (equipmentResult.data && gangOriginResult.data) {
            const equipmentMap = new Map(equipmentResult.data.map(item => [item.id, item.equipment_name]));
            const gangOriginMap = new Map(gangOriginResult.data.map(item => [item.id, item.origin_name]));

            vehicleDetails.gang_origin_equipment = gangOriginEquipment.map((item: { id: string; equipment_id: string; gang_origin_id: string }) => ({
              id: item.id,
              gang_origin_id: item.gang_origin_id,
              origin_name: gangOriginMap.get(item.gang_origin_id) || 'Unknown Origin',
              equipment_id: item.equipment_id,
              equipment_name: equipmentMap.get(item.equipment_id) || 'Unknown Equipment'
            }));
          }
        } else {
          vehicleDetails.gang_origin_equipment = [];
        }

        // Fetch equipment names and gang type names for gang type equipment
        if (gangTypeEquipment.length > 0) {
          const equipmentIds = gangTypeEquipment.map((item: { equipment_id: string; gang_type_id: string }) => item.equipment_id);
          const gangTypeIds = gangTypeEquipment.map((item: { equipment_id: string; gang_type_id: string }) => item.gang_type_id);

          const [equipmentResult, gangTypeResult] = await Promise.all([
            supabase
              .from('equipment')
              .select('id, equipment_name')
              .in('id', equipmentIds),
            supabase
              .from('gang_types')
              .select('gang_type_id, gang_type')
              .in('gang_type_id', gangTypeIds)
          ]);

          if (equipmentResult.data && gangTypeResult.data) {
            const equipmentMap = new Map(equipmentResult.data.map(item => [item.id, item.equipment_name]));
            const gangTypeMap = new Map(gangTypeResult.data.map(item => [item.gang_type_id.toString(), item.gang_type]));

            vehicleDetails.gang_type_equipment = gangTypeEquipment.map((item: { id: string; equipment_id: string; gang_type_id: string }) => ({
              id: item.id,
              gang_type_id: item.gang_type_id,
              gang_type_name: gangTypeMap.get(item.gang_type_id) || 'Unknown Gang Type',
              equipment_id: item.equipment_id,
              equipment_name: equipmentMap.get(item.equipment_id) || 'Unknown Equipment'
            }));
          }
        } else {
          vehicleDetails.gang_type_equipment = [];
        }

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
    const equipment_list = vehicleData.equipment_list || [];
    const gang_origin_equipment = vehicleData.gang_origin_equipment || [];
    const gang_type_equipment = vehicleData.gang_type_equipment || [];

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
      hardpoints: vehicleData.hardpoints || [],
      // Initialize occupied slots to 0
      body_slots_occupied: 0,
      drive_slots_occupied: 0,
      engine_slots_occupied: 0
    };

    // Remove equipment data from the vehicle record
    delete formattedData.equipment_list;
    delete formattedData.gang_origin_equipment;
    delete formattedData.gang_type_equipment;

    const { data, error } = await supabase
      .from('vehicle_types')
      .insert([formattedData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    const vehicle_id = data.id;

    // Handle equipment associations if equipment data is provided
    if (equipment_list.length > 0 || gang_origin_equipment.length > 0 || gang_type_equipment.length > 0) {
      const allEquipmentAssociations = [];

      // Add regular equipment (without gang origin)
      if (equipment_list.length > 0) {
        const regularEquipmentAssociations = equipment_list.map((equipment_id: string) => ({
          equipment_id,
          fighter_type_id: null,
          vehicle_type_id: vehicle_id,
          gang_origin_id: null,
          gang_type_id: null
        }));
        allEquipmentAssociations.push(...regularEquipmentAssociations);
      }

      // Add gang origin equipment
      if (gang_origin_equipment.length > 0) {
        const gangOriginEquipmentAssociations = gang_origin_equipment.map((item: GangOriginEquipmentItem) => ({
          equipment_id: item.equipment_id,
          fighter_type_id: null,
          vehicle_type_id: vehicle_id,
          gang_origin_id: item.gang_origin_id,
          gang_type_id: null
        }));
        allEquipmentAssociations.push(...gangOriginEquipmentAssociations);
      }

      // Add gang type equipment
      if (gang_type_equipment.length > 0) {
        const gangTypeEquipmentAssociations = gang_type_equipment.map((item: GangTypeEquipmentItem) => ({
          equipment_id: item.equipment_id,
          fighter_type_id: null,
          vehicle_type_id: vehicle_id,
          gang_origin_id: null,
          gang_type_id: item.gang_type_id
        }));
        allEquipmentAssociations.push(...gangTypeEquipmentAssociations);
      }

      // Insert all equipment associations at once
      if (allEquipmentAssociations.length > 0) {
        const { error: insertError } = await supabase
          .from('fighter_type_equipment')
          .insert(allEquipmentAssociations);

        if (insertError) throw insertError;
      }
    }

    return NextResponse.json({
      ...data,
      equipment_list,
      gang_origin_equipment,
      gang_type_equipment
    });
  } catch (error) {
    console.error('Error creating vehicle type:', error);
    return NextResponse.json(
      { error: 'Failed to create vehicle type' },
      { status: 500 }
    );
  }
}


export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const vehicle_id = searchParams.get('id');

  // Check admin authorization
  const isAdmin = await checkAdmin(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!vehicle_id) {
    return NextResponse.json({ error: 'Vehicle ID is required' }, { status: 400 });
  }

  try {
    const vehicleData: VehicleFormData = await request.json();
    const equipment_list = vehicleData.equipment_list || [];
    const gang_origin_equipment = vehicleData.gang_origin_equipment || [];
    const gang_type_equipment = vehicleData.gang_type_equipment || [];


    // Format the data
    const formattedData = {
      cost: parseInt(vehicleData.cost || "0"),
      movement: parseInt(vehicleData.movement || "0"),
      front: parseInt(vehicleData.front || "0"),
      side: parseInt(vehicleData.side || "0"),
      rear: parseInt(vehicleData.rear || "0"),
      hull_points: parseInt(vehicleData.hull_points || "0"),
      body_slots: parseInt(vehicleData.body_slots || "0"),
      drive_slots: parseInt(vehicleData.drive_slots || "0"),
      engine_slots: parseInt(vehicleData.engine_slots || "0"),
      gang_type_id: vehicleData.gang_type_id === "0" ? null : vehicleData.gang_type_id,
      handling: vehicleData.handling,
      save: vehicleData.save,
      vehicle_type: vehicleData.vehicle_type,
      special_rules: vehicleData.special_rules || [],
      hardpoints: vehicleData.hardpoints || []
    };

    const { error: updateError } = await supabase
      .from('vehicle_types')
      .update(formattedData)
      .eq('id', vehicle_id);

    if (updateError) throw updateError;

    // Handle equipment associations only if equipment data is provided
    if (equipment_list.length >= 0 || gang_origin_equipment.length >= 0 || gang_type_equipment.length >= 0) {
      // Delete existing equipment associations for this vehicle
      const { error: deleteError } = await supabase
        .from('fighter_type_equipment')
        .delete()
        .eq('vehicle_type_id', vehicle_id);

      if (deleteError) throw deleteError;

      // Insert new equipment associations if there are any
      const allEquipmentAssociations = [];

      // Add regular equipment (without gang origin)
      if (equipment_list.length > 0) {
        const regularEquipmentAssociations = equipment_list.map((equipment_id: string) => ({
          equipment_id,
          fighter_type_id: null,
          vehicle_type_id: vehicle_id,
          gang_origin_id: null,
          gang_type_id: null
        }));
        allEquipmentAssociations.push(...regularEquipmentAssociations);
      }

      // Add gang origin equipment
      if (gang_origin_equipment.length > 0) {
        const gangOriginEquipmentAssociations = gang_origin_equipment.map((item: GangOriginEquipmentItem) => ({
          equipment_id: item.equipment_id,
          fighter_type_id: null,
          vehicle_type_id: vehicle_id,
          gang_origin_id: item.gang_origin_id,
          gang_type_id: null
        }));
        allEquipmentAssociations.push(...gangOriginEquipmentAssociations);
      }

      // Add gang type equipment
      if (gang_type_equipment.length > 0) {
        const gangTypeEquipmentAssociations = gang_type_equipment.map((item: GangTypeEquipmentItem) => ({
          equipment_id: item.equipment_id,
          fighter_type_id: null,
          vehicle_type_id: vehicle_id,
          gang_origin_id: null,
          gang_type_id: item.gang_type_id
        }));
        allEquipmentAssociations.push(...gangTypeEquipmentAssociations);
      }

      // Insert all equipment associations at once
      if (allEquipmentAssociations.length > 0) {
        const { error: insertError } = await supabase
          .from('fighter_type_equipment')
          .insert(allEquipmentAssociations);

        if (insertError) throw insertError;
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      equipment_list,
      gang_origin_equipment,
      gang_type_equipment
    });

  } catch (error) {
    console.error('Error in PATCH:', error);
    return NextResponse.json(
      { error: 'Failed to update vehicle type', details: error },
      { status: 500 }
    );
  }
} 