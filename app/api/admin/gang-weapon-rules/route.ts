import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkAdmin } from '@/utils/auth';
import { invalidateGangWeaponRules } from '@/utils/cache-tags';

const COLUMNS = 'id, fighter_effect_type_id, gang_type_id, gang_origin_id, gang_subtype_id, excluded';

/** The gang scopes of one gang weapon rule (a fighter effect type in the gang-weapon-rules category). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!(await checkAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const effectTypeId = new URL(request.url).searchParams.get('fighter_effect_type_id');
  if (!effectTypeId) {
    return NextResponse.json({ error: 'fighter_effect_type_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('gang_weapon_rules')
    .select(COLUMNS)
    .eq('fighter_effect_type_id', effectTypeId)
    .order('created_at');

  if (error) {
    console.error('Error fetching gang weapon rules:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!(await checkAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  if (!body.fighter_effect_type_id) {
    return NextResponse.json({ error: 'fighter_effect_type_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('gang_weapon_rules')
    .insert({
      fighter_effect_type_id: body.fighter_effect_type_id,
      gang_type_id: body.gang_type_id || null,
      gang_origin_id: body.gang_origin_id || null,
      gang_subtype_id: body.gang_subtype_id || null,
      excluded: body.excluded === true
    })
    .select(COLUMNS)
    .single();

  if (error) {
    console.error('Error creating gang weapon rule:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateGangWeaponRules();
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  if (!(await checkAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabase.from('gang_weapon_rules').delete().eq('id', id);

  if (error) {
    console.error('Error deleting gang weapon rule:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateGangWeaponRules();
  return NextResponse.json({ success: true });
}
