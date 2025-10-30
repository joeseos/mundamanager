import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

interface Skill {
  id: string;
  name: string;
  skill_type_id: string;
  gang_origin_id: string | null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const skillTypeId = searchParams.get('skill_type_id');
  const effectTypeId = searchParams.get('effect_type_id');
  const modifierId = searchParams.get('modifier_id');

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Handle fighter effect type queries
    if (effectTypeId) {
      const { data, error } = await supabase
        .from('fighter_effect_types')
        .select(`
          id,
          effect_name,
          fighter_effect_category_id,
          type_specific_data,
          fighter_effect_categories(id, category_name)
        `)
        .eq('id', effectTypeId)
        .single();

      if (error) throw error;

      // Fetch modifiers for this effect type
      const { data: modifiers } = await supabase
        .from('fighter_effect_type_modifiers')
        .select('*')
        .eq('fighter_effect_type_id', effectTypeId);

      return NextResponse.json({
        ...data,
        modifiers: modifiers || []
      });
    }

    // Handle modifier queries
    if (modifierId) {
      const { data, error } = await supabase
        .from('fighter_effect_type_modifiers')
        .select('*')
        .eq('id', modifierId)
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    // Handle skill queries
    let query = supabase
      .from('skills')
      .select('id, name, skill_type_id, gang_origin_id')
      .order('name');

    if (skillTypeId) {
      query = query.eq('skill_type_id', skillTypeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // If fetching a specific skill, include its effects
    let transformedData;
    if (skillTypeId && data.length > 0) {
      // Fetch effects for all skills in the result
      const skillIds = data.map((skill: Skill) => skill.id);

      const { data: effectTypes } = await supabase
        .from('fighter_effect_types')
        .select(`
          id,
          effect_name,
          fighter_effect_category_id,
          type_specific_data,
          fighter_effect_categories(id, category_name)
        `)
        .in('type_specific_data->>skill_id', skillIds);

      // Fetch modifiers for the effect types
      let modifiers: any[] = [];
      if (effectTypes && effectTypes.length > 0) {
        const effectTypeIds = effectTypes.map(et => et.id);
        const { data: modifiersData } = await supabase
          .from('fighter_effect_type_modifiers')
          .select('*')
          .in('fighter_effect_type_id', effectTypeIds);

        modifiers = modifiersData || [];
      }

      // Map skills with their effects
      transformedData = data.map((skill: Skill) => {
        const skillEffects = (effectTypes || [])
          .filter((et: any) => et.type_specific_data?.skill_id === skill.id)
          .map((et: any) => ({
            ...et,
            modifiers: modifiers.filter((m: any) => m.fighter_effect_type_id === et.id)
          }));

        return {
          id: skill.id,
          skill_name: skill.name,
          skill_type_id: skill.skill_type_id,
          gang_origin_id: skill.gang_origin_id,
          effects: skillEffects
        };
      });

      // Extract unique categories from the effects (they're already nested in each effect)
      const uniqueCategories = new Map();
      effectTypes?.forEach((et: any) => {
        if (et.fighter_effect_categories) {
          uniqueCategories.set(
            et.fighter_effect_categories.id,
            et.fighter_effect_categories
          );
        }
      });

      // Always include the 'skills' category, even if no effects exist yet
      if (uniqueCategories.size === 0) {
        const { data: skillsCategory } = await supabase
          .from('fighter_effect_categories')
          .select('id, category_name')
          .eq('category_name', 'skills')
          .single();

        if (skillsCategory) {
          uniqueCategories.set(skillsCategory.id, skillsCategory);
        }
      }

      return NextResponse.json({
        skills: transformedData,
        effect_categories: Array.from(uniqueCategories.values())
      });
    } else {
      transformedData = data.map((skill: Skill) => ({
        id: skill.id,
        skill_name: skill.name,
        skill_type_id: skill.skill_type_id,
        gang_origin_id: skill.gang_origin_id
      }));

      return NextResponse.json(transformedData);
    }
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
  const { searchParams } = new URL(request.url);
  const isModifier = searchParams.get('modifier') === 'true';
  const isEffect = searchParams.get('effect') === 'true';

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Create modifier
    if (isModifier) {
      if (!body.fighter_effect_type_id || !body.stat_name) {
        return NextResponse.json(
          { error: 'fighter_effect_type_id and stat_name are required' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('fighter_effect_type_modifiers')
        .insert({
          fighter_effect_type_id: body.fighter_effect_type_id,
          stat_name: body.stat_name,
          default_numeric_value: body.default_numeric_value || 0,
          operation: body.operation || 'add'
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    // Create fighter effect type
    if (isEffect) {
      if (!body.effect_name) {
        return NextResponse.json({ error: 'Effect name is required' }, { status: 400 });
      }

      let typeSpecificData = null;
      if (body.type_specific_data) {
        if (typeof body.type_specific_data === 'object') {
          typeSpecificData = { ...body.type_specific_data };
          if (body.type_specific_data.skill_id) {
            typeSpecificData.skill_id = String(body.type_specific_data.skill_id);
          }
        }
      }

      const { data, error } = await supabase
        .from('fighter_effect_types')
        .insert({
          effect_name: body.effect_name,
          fighter_effect_category_id: body.fighter_effect_category_id || null,
          type_specific_data: typeSpecificData
        })
        .select()
        .single();

      if (error) throw error;

      // Insert modifiers if provided
      if (body.modifiers && Array.isArray(body.modifiers) && body.modifiers.length > 0) {
        const modifiersToInsert = body.modifiers.map((modifier: any) => ({
          fighter_effect_type_id: data.id,
          stat_name: modifier.stat_name,
          default_numeric_value: modifier.default_numeric_value || modifier.numeric_value || 0,
          operation: modifier.operation || 'add'
        }));

        const { error: modError } = await supabase
          .from('fighter_effect_type_modifiers')
          .insert(modifiersToInsert);

        if (modError) {
          console.error('Error creating modifiers:', modError);
        }
      }

      return NextResponse.json(data);
    }

    // Create skill
    const formattedData = {
      name: body.name,
      skill_type_id: body.skill_type_id,
      xp_cost: parseInt(body.xp_cost) || 0,
      credit_cost: parseInt(body.credit_cost) || 0,
      gang_origin_id: body.gang_origin_id || null
    };

    const { data, error } = await supabase
      .from('skills')
      .insert(formattedData)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in POST handler:', error);
    return NextResponse.json(
      { error: 'Failed to create resource' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const isModifier = searchParams.get('modifier') === 'true';
  const isEffect = searchParams.get('effect') === 'true';
  const id = searchParams.get('id');

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Update modifier
    if (isModifier) {
      if (!id) {
        return NextResponse.json({ error: 'Modifier ID is required' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('fighter_effect_type_modifiers')
        .update({
          stat_name: body.stat_name,
          default_numeric_value: body.default_numeric_value,
          operation: body.operation || 'add'
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    // Update fighter effect type
    if (isEffect) {
      if (!id) {
        return NextResponse.json({ error: 'Effect ID is required' }, { status: 400 });
      }

      let typeSpecificData = null;
      if (body.type_specific_data) {
        if (typeof body.type_specific_data === 'object') {
          typeSpecificData = { ...body.type_specific_data };
          if (body.type_specific_data.skill_id) {
            typeSpecificData.skill_id = String(body.type_specific_data.skill_id);
          }
        }
      }

      const { data, error } = await supabase
        .from('fighter_effect_types')
        .update({
          effect_name: body.effect_name,
          fighter_effect_category_id: body.fighter_effect_category_id,
          type_specific_data: typeSpecificData
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    // Update skill
    const formattedData = {
      name: body.name,
      id: body.id,
      gang_origin_id: body.gang_origin_id || null,
    };

    const { data, error } = await supabase
      .from('skills')
      .update(formattedData)
      .eq('id', formattedData.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH handler:', error);
    return NextResponse.json(
      { error: 'Failed to update resource' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const isModifier = searchParams.get('modifier') === 'true';
  const isEffect = searchParams.get('effect') === 'true';
  const id = searchParams.get('id');

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete modifier
    if (isModifier) {
      if (!id) {
        return NextResponse.json({ error: 'Modifier ID is required' }, { status: 400 });
      }

      const { error } = await supabase
        .from('fighter_effect_type_modifiers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Modifier deleted successfully' });
    }

    // Delete fighter effect type
    if (isEffect) {
      if (!id) {
        return NextResponse.json({ error: 'Effect ID is required' }, { status: 400 });
      }

      // First delete modifiers associated with this effect
      await supabase
        .from('fighter_effect_type_modifiers')
        .delete()
        .eq('fighter_effect_type_id', id);

      // Then delete the effect
      const { error } = await supabase
        .from('fighter_effect_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Effect deleted successfully' });
    }

    // Delete skill
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Skill ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('skills')
      .delete()
      .eq('id', body.id);

    if (error) throw error;
    return NextResponse.json({ success: true, message: 'Skill deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE handler:', error);
    return NextResponse.json(
      { error: 'Failed to delete resource' },
      { status: 500 }
    );
  }
}
