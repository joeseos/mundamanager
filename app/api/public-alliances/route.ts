import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient();

  try {
    // Just check if user is authenticated, no admin check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('alliances')
      .select('id, alliance_name, alliance_type, strong_alliance')
      .order('alliance_name');

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching alliances:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alliances' },
      { status: 500 }
    );
  }
} 