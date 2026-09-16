import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('gang_origin_categories')
      .select('id, category_name')
      .order('category_name');

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching gang origin categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang origin categories' },
      { status: 500 }
    );
  }
}
