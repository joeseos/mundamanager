import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

interface VehicleProfile {
  movement: string | null;
  front: string | null;
  side: string | null;
  rear: string | null;
  hp: string | null;
  handling: string | null;
  save: string | null;
  equipment_id: string;
}

export async function POST(request: Request) {
  const supabase = createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const vehicleProfile: VehicleProfile = body;

    const { data, error } = await supabase
      .from('vehicle_profiles')
      .insert(vehicleProfile)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in POST vehicle profile:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create vehicle profile',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const equipment_id = searchParams.get('equipment_id');

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!equipment_id) {
      return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('vehicle_profiles')
      .select('*')
      .eq('equipment_id', equipment_id)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET vehicle profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vehicle profile' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const equipment_id = searchParams.get('equipment_id');

  if (!equipment_id) {
    return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 });
  }

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const vehicleProfile: VehicleProfile = body;

    const { data, error } = await supabase
      .from('vehicle_profiles')
      .update(vehicleProfile)
      .eq('equipment_id', equipment_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PUT vehicle profile:', error);
    return NextResponse.json(
      { error: 'Failed to update vehicle profile' },
      { status: 500 }
    );
  }
} 