import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET() {
  const supabase = createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('skill_types')
      .select('id, name')
      .order('name');

    if (error) throw error;

    const transformedData = data.map(type => ({
      id: type.id,
      skill_type: type.name
    }));

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Error fetching skill types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skill types' },
      { status: 500 }
    );
  }
} 