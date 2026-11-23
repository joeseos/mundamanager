import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';

export async function GET(request: Request) {
  const skillTypeId = new URL(request.url).searchParams.get('skill_type_id');
  if (!skillTypeId) {
    return NextResponse.json({ error: 'Missing skill_type_id' }, { status: 400 });
  }

  const supabase = await createClient();
  if (!await getUserIdFromClaims(supabase)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('skills')
    .select('id, name')
    .eq('skill_type_id', skillTypeId)
    .order('name');
  if (error) {
    console.error('Error fetching skills:', error);
    return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 });
  }
  return NextResponse.json(data);
}
