import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('gang_types')
      .select('gang_type_id, gang_type')
      .order('gang_type');

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching gang types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang types' },
      { status: 500 }
    );
  }
}

// Add interface for the request data
interface FighterTypeData {
  fighterType: string;
  baseCost: number;
  gangTypeId: string;
  fighterClass: string;
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  attacks: number;
  special_rules?: string;
  free_skill: boolean;
  default_equipment?: string[];  // Array of equipment IDs
}

export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    // Check admin authorization
    const isAdmin = await checkAdmin(supabase);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data: FighterTypeData = await request.json();
    console.log('Received data:', data);

    // Get the gang type
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

    // Create fighter type
    const { data: newFighterType, error: insertError } = await supabase
      .from('fighter_types')
      .insert([{
        fighter_type: data.fighterType,
        cost: data.baseCost,
        gang_type_id: data.gangTypeId,
        gang_type: gangType.gang_type,
        fighter_class: data.fighterClass,
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
      }])
      .select('id')
      .single();

    if (insertError) {
      console.error('Error inserting fighter type:', insertError);
      throw insertError;
    }

    console.log('Created fighter type:', newFighterType); // Debug log

    // Create equipment defaults with proper typing
    if (data.default_equipment && data.default_equipment.length > 0) {
      const equipmentDefaults = data.default_equipment.map((equipmentId: string) => ({
        fighter_type_id: newFighterType.id,
        equipment_id: equipmentId
      }));

      console.log('Creating equipment defaults:', equipmentDefaults);

      const { error: equipmentError } = await supabase
        .from('fighter_defaults')
        .insert(equipmentDefaults);

      if (equipmentError) {
        console.error('Error inserting equipment defaults:', equipmentError);
        throw equipmentError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Detailed error in POST:', error);
    
    return NextResponse.json({ 
      error: 'Error creating fighter type',
      details: error instanceof Error ? error.message : 'Unknown error',
      name: error instanceof Error ? error.name : 'Unknown'
    }, { status: 500 });
  }
} 