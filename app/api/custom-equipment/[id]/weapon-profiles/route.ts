import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { isUuid } from '@/utils/uuid';

/** A custom weapon's own profiles plus the ones grouped under it (ammunition). */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid equipment id' }, { status: 400 });
  }

  const supabase = await createClient();
  if (!await getUserIdFromClaims(supabase)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('custom_weapon_profiles')
    .select('*')
    .or(`custom_equipment_id.eq.${id},weapon_group_id.eq.${id}`)
    .order('sort_order');
  if (error) {
    console.error('Error fetching weapon profiles:', error);
    return NextResponse.json({ error: 'Failed to fetch weapon profiles' }, { status: 500 });
  }
  return NextResponse.json(data);
}
