import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkAdmin } from '@/utils/auth';

interface Skill {
  id: string;
  name: string;
  skill_type_id: string;
}

export async function GET(request: Request) {
  const supabase = await createClient();
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

    const transformedData = data.map((skill: Skill) => ({
      id: skill.id,
      skill_name: skill.name,
      skill_type_id: skill.skill_type_id,
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
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const skillData = await request.json();

    const formattedData = {
      name: skillData.name,
      skill_type_id: skillData.skill_type_id,
      xp_cost: parseInt(skillData.xp_cost),
      credit_cost: parseInt(skillData.credit_cost),
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

export async function PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const skillData = await request.json();

    const formattedData = {
      name: skillData.name,
      id: skillData.id,
    };

    const { data, error } = await supabase
      .from('skills')
      .update([formattedData])
      .eq('id', formattedData.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating skill:', error);
    return NextResponse.json(
      { error: 'Failed to update skill' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { error: 'Skill ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('skills').delete().eq('id', body.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Skill deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting skill:', error);
    return NextResponse.json(
      { error: 'Failed to delete skill' },
      { status: 500 }
    );
  }
}
