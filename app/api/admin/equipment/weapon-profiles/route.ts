import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 });
  }

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profiles, error } = await supabase
      .from('weapon_profiles')
      .select(`
        profile_name,
        range_short,
        range_long,
        acc_short,
        acc_long,
        strength,
        ap,
        damage,
        ammo,
        traits,
        is_default_profile,
        weapon_group_id,
        sort_order
      `)
      .eq('weapon_id', id)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    console.log('Fetched weapon profiles:', profiles);

    return NextResponse.json(profiles || []);
  } catch (error) {
    console.error('Error in GET weapon profiles:', error);
    return NextResponse.json(
      { 
        error: 'Error fetching weapon profiles',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 