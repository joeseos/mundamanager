import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('equipment')
      .select('id, equipment_name, equipment_category')
      .order('equipment_name');

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch equipment' },
      { status: 500 }
    );
  }
}