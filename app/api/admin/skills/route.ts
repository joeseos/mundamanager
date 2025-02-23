import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const skillTypeId = searchParams.get('skill_type_id');

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query = supabase
      .from('skills')
      .select('id, name, skill_type_id')
      .order('name');

    if (skillTypeId) {
      query = query.eq('skill_type_id', skillTypeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const transformedData = data.map(skill => ({
      id: skill.id,
      skill_name: skill.name,
      skill_type_id: skill.skill_type_id
    }));

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Error fetching skills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skills' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const skillData = await request.json();
    
    const formattedData = {
      ...skillData,
      skill_name: skillData.name,
      skill_type_id: skillData.skill_type_id,
      xp_cost: skillData.xp_cost,
      credit_cost: skillData.credit_cost
    };

    const { data, error } = await supabase
      .from('skills')
      .insert([formattedData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating skill:', error);
    return NextResponse.json(
      { error: 'Failed to create skill' },
      { status: 500 }
    );
  }
}