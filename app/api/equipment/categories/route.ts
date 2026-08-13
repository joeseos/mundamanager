import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";
import { withEditionSlug } from "@/types/edition";

export async function GET() {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Categories are edition-scoped, and a name can repeat across editions
    // (e.g. Grenades exists in both n23 and n26), so clients filter by
    // edition_slug and identify a category by id rather than by name.
    const { data, error } = await supabase
      .from('equipment_categories')
      .select('id, category_name, editions:edition_id (slug)')
      .order('category_name');

    if (error) throw error;

    return NextResponse.json((data ?? []).map(withEditionSlug));
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
} 