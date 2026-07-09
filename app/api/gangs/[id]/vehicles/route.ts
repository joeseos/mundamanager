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
    const gangTypeFilter = gang.gang_type_id
      ? `gang_type_id.eq.${gang.gang_type_id},gang_type_id.is.null`
      : `gang_type_id.is.null`;
    const { data: vehicleTypes, error } = await supabase
      .from('vehicle_types')
      .select('*')
      .or(gangTypeFilter)
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

