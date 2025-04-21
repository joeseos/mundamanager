import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('vehicle_equipment_profiles')
      .select('*')
      .eq('equipment_id', id)
      .order('profile_name');

    if (error) throw error;

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching vehicle profiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vehicle profiles' },
      { status: 500 }
    );
  }
} 