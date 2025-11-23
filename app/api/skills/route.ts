import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (!type) {
      return NextResponse.json(
        { error: 'Missing type parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('skills')
      .select('*')
      .eq('skill_type_id', type);

    if (error) throw error;

    return NextResponse.json({ skills: data });
  } catch (error) {
    console.error('Error in GET /api/skills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skills' },
      { status: 500 }
    );
  }
} 