import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

// Get all fighter types
export async function GET(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const equipment_id = searchParams.get('equipment_id');

  // Check admin authorization
  const isAdmin = await checkAdmin(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // If equipment_id is provided, fetch fighter types that have this equipment
    if (equipment_id) {
      // First get the fighter_type_ids from fighter_defaults
      const { data: defaultsData, error: defaultsError } = await supabase
        .from('fighter_defaults')
        .select('fighter_type_id')
        .eq('equipment_id', equipment_id);

      if (defaultsError) throw defaultsError;

      // Get the unique fighter_type_ids using Array.from instead of spread operator
      const fighterTypeIds = Array.from(new Set(defaultsData.map(d => d.fighter_type_id)));

      // Then get the fighter types using those IDs
      const { data: fighterTypes, error } = await supabase
        .from('fighter_types')
        .select(`
          id,
          fighter_type,
          gang_type_id,
          gang_type,
          fighter_class,
          cost
        `)
        .in('id', fighterTypeIds);

      if (error) throw error;

      return NextResponse.json(fighterTypes);
    }

    // If specific fighter type ID is provided
    if (id) {
      const { data: fighterType, error } = await supabase
        .from('fighter_types')
        .select(`
          id,
          fighter_type,
          gang_type_id,
          gang_type,
          fighter_class,
          cost,
          movement,
          weapon_skill,
          ballistic_skill,
          strength,
          toughness,
          wounds,
          initiative,
          leadership,
          cool,
          willpower,
          intelligence,
          attacks,
          special_rules,
          free_skill
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching fighter type:', error);
        throw error;
      }

      if (!fighterType) {
        return NextResponse.json(
          { error: 'Fighter type not found' },
          { status: 404 }
        );
      }

      // Fetch default equipment
      const { data: defaultEquipment, error: equipmentError } = await supabase
        .from('fighter_defaults')
        .select('equipment_id')
        .eq('fighter_type_id', fighterType.id)
        .not('equipment_id', 'is', null);

      if (equipmentError) {
        console.error('Error fetching default equipment:', equipmentError);
        throw equipmentError;
      }

      // Fetch default skills
      const { data: defaultSkills, error: skillsError } = await supabase
        .from('fighter_defaults')
        .select('skill_id')
        .eq('fighter_type_id', fighterType.id)
        .not('skill_id', 'is', null);

      if (skillsError) {
        console.error('Error fetching default skills:', skillsError);
        throw skillsError;
      }

      const formattedFighterType = {
        ...fighterType,
        default_equipment: defaultEquipment?.map(d => d.equipment_id) || [],
        default_skills: defaultSkills?.map(d => d.skill_id) || []
      };

      return NextResponse.json(formattedFighterType);
    }

    // Default case - fetch all fighter types
    const { data: fighterTypes, error } = await supabase
      .from('fighter_types')
      .select(`
        id,
        fighter_type,
        gang_type_id,
        gang_type,
        fighter_class,
        cost
      `)
      .order('gang_type', { ascending: true })
      .order('fighter_type', { ascending: true });

    if (error) throw error;
    return NextResponse.json(fighterTypes);

  } catch (error) {
    console.error('Error in GET fighter-types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fighter types' },
      { status: 500 }
    );
  }
}

// Add PUT handler to the existing file
export async function PUT(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Fighter type ID is required' }, { status: 400 });
  }

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    console.log('Received update data:', data); // Debug log

    // Update fighter type
    const { error: updateError } = await supabase
      .from('fighter_types')
      .update({
        fighter_type: data.fighter_type,
        cost: data.cost,
        gang_type_id: data.gang_type_id,
        fighter_class: data.fighter_class,
        fighter_class_id: data.fighter_class_id,
        movement: data.movement,
        weapon_skill: data.weapon_skill,
        ballistic_skill: data.ballistic_skill,
        strength: data.strength,
        toughness: data.toughness,
        wounds: data.wounds,
        initiative: data.initiative,
        attacks: data.attacks,
        leadership: data.leadership,
        cool: data.cool,
        willpower: data.willpower,
        intelligence: data.intelligence,
        special_rules: data.special_rules,
        free_skill: data.free_skill
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating fighter type:', updateError);
      throw updateError;
    }

    // Delete existing defaults
    const { error: deleteDefaultsError } = await supabase
      .from('fighter_defaults')
      .delete()
      .eq('fighter_type_id', id);

    if (deleteDefaultsError) {
      console.error('Error deleting existing defaults:', deleteDefaultsError);
      throw deleteDefaultsError;
    }

    // Insert new equipment defaults
    if (data.default_equipment?.length > 0) {
      const equipmentDefaults = data.default_equipment.map((equipmentId: string) => ({
        fighter_type_id: id,
        equipment_id: equipmentId,
        skill_id: null
      }));

      const { error: insertEquipError } = await supabase
        .from('fighter_defaults')
        .insert(equipmentDefaults);

      if (insertEquipError) {
        console.error('Error inserting equipment defaults:', insertEquipError);
        throw insertEquipError;
      }
    }

    // Insert new skill defaults
    if (data.default_skills?.length > 0) {
      const skillDefaults = data.default_skills.map((skillId: string) => ({
        fighter_type_id: id,
        skill_id: skillId,
        equipment_id: null
      }));

      const { error: insertSkillError } = await supabase
        .from('fighter_defaults')
        .insert(skillDefaults);

      if (insertSkillError) {
        console.error('Error inserting skill defaults:', insertSkillError);
        throw insertSkillError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PUT fighter-type:', error);
    return NextResponse.json(
      { 
        error: 'Error updating fighter type',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Add POST handler if it doesn't exist, or update the existing one
export async function POST(request: Request) {
  const supabase = createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    // First fetch the gang type name
    const { data: gangType, error: gangTypeError } = await supabase
      .from('gang_types')
      .select('gang_type')
      .eq('gang_type_id', data.gangTypeId)
      .single();

    if (gangTypeError) {
      console.error('Error fetching gang type:', gangTypeError);
      throw gangTypeError;
    }

    if (!gangType) {
      throw new Error('Gang type not found');
    }

    // Insert the fighter type with both class name and ID, and gang type
    const { data: newFighterType, error: insertError } = await supabase
      .from('fighter_types')
      .insert({
        fighter_type: data.fighterType,
        gang_type_id: data.gangTypeId,
        gang_type: gangType.gang_type,        // Add the gang type name
        fighter_class: data.fighterClass,     // The class name
        fighter_class_id: data.fighterClassId,// The class ID
        cost: data.baseCost,
        movement: data.movement,
        weapon_skill: data.weapon_skill,
        ballistic_skill: data.ballistic_skill,
        strength: data.strength,
        toughness: data.toughness,
        wounds: data.wounds,
        initiative: data.initiative,
        leadership: data.leadership,
        cool: data.cool,
        willpower: data.willpower,
        intelligence: data.intelligence,
        attacks: data.attacks,
        special_rules: data.special_rules,
        free_skill: data.free_skill
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Handle default equipment if provided
    if (data.default_equipment && data.default_equipment.length > 0) {
      const equipmentDefaults = data.default_equipment.map((equipmentId: string) => ({
        fighter_type_id: newFighterType.id,
        equipment_id: equipmentId
      }));

      const { error: equipmentError } = await supabase
        .from('fighter_defaults')
        .insert(equipmentDefaults);

      if (equipmentError) throw equipmentError;
    }

    // Handle default skills if provided
    if (data.default_skills && data.default_skills.length > 0) {
      const skillDefaults = data.default_skills.map((skillId: string) => ({
        fighter_type_id: newFighterType.id,
        skill_id: skillId,
        equipment_id: null  // Since this is a skill default, equipment_id should be null
      }));

      const { error: skillError } = await supabase
        .from('fighter_defaults')
        .insert(skillDefaults);

      if (skillError) throw skillError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST:', error);
    return NextResponse.json(
      { 
        error: 'Error creating fighter type',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 