import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: origins, error } = await supabase
      .from('gang_origins')
      .select(`
        id,
        origin_name,
        gang_origin_category_id,
        gang_origin_categories!gang_origin_category_id (
          id,
          category_name
        )
      `)
      .order('origin_name');

    if (error) throw error;

    const transformedData = origins.map((origin: any) => ({
      id: origin.id,
      origin_name: origin.origin_name,
      category_id: origin.gang_origin_category_id,
      category_name: (origin.gang_origin_categories as any)?.category_name || 'Unknown'
    }));

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Error fetching gang origins:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang origins' },
      { status: 500 }
    );
  }
}