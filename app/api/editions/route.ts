import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET() {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('editions')
      .select('id, name, slug, is_current, released_at')
      .order('released_at', { ascending: false, nullsFirst: false })
      .order('name');

    if (error) throw error;

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching editions:', error)
    return NextResponse.json({ error: 'Error fetching editions' }, { status: 500 })
  }
}
