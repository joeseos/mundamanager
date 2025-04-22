import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('skill_types')
      .select('*');

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/skill-types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skill sets' },
      { status: 500 }
    );
  }
} 