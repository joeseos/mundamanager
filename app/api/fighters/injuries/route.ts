import { createClient } from "@/utils/supabase/server";
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();

  try {
    const { data: injuries, error } = await supabase
      .from('injuries')
      .select('id, injury_name')
      .order('injury_name');

    if (error) throw error;

    return NextResponse.json(injuries);
  } catch (error) {
    console.error('Error fetching injuries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch injuries' },
      { status: 500 }
    );
  }
} 