import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkAdmin } from '@/utils/auth';
import { invalidateGangRules } from '@/utils/cache-tags';

const COLUMNS = 'id, fighter_effect_type_id, gang_type_id, gang_origin_id, gang_subtype_id, excluded';

/** A gang type's gang rule rows, each with its fighter effect type and modifiers. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!(await checkAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gangTypeId = new URL(request.url).searchParams.get('gang_type_id');
  if (!gangTypeId) {
    return NextResponse.json({ error: 'gang_type_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('gang_rules')
    .select(`${COLUMNS}, fighter_effect_types (id, effect_name, type_specific_data, fighter_effect_type_modifiers (id, stat_name, default_numeric_value, operation))`)
    .eq('gang_type_id', gangTypeId)
    .order('created_at');

  if (error) {
    console.error('Error fetching gang rules:', error);
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
  if (!body.fighter_effect_type_id || !body.gang_type_id) {
    return NextResponse.json({ error: 'fighter_effect_type_id and gang_type_id are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('gang_rules')
    .insert({
      fighter_effect_type_id: body.fighter_effect_type_id,
      gang_type_id: body.gang_type_id,
      gang_origin_id: body.gang_origin_id || null,
      gang_subtype_id: body.gang_subtype_id || null,
      excluded: body.excluded === true
    })
    .select(COLUMNS)
    .single();

  if (error) {
    console.error('Error creating gang rule:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateGangRules();
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

  const { error } = await supabase.from('gang_rules').delete().eq('id', id);

  if (error) {
    console.error('Error deleting gang rule:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateGangRules();
  return NextResponse.json({ success: true });
}
