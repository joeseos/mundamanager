import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Add Edge Function configurations
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Define TypeScript types for better type checking
type Weapon = {
  weapon_id: string;
  weapon_name: string;
  range_short: number;
  range_long: number;
  acc_short: number;
  acc_long: number;
  strength: number;
  ap: number;
  damage: number;
  ammo: number;
  traits: string;
};

type Fighter = {
  id: string;
  fighter_name: string;
  fighter_type_id: string;
  fighter_type: string;
  fighter_sub_type?: string;
  fighter_sub_type_id?: string;
  fighter_class?: string;
  fighter_class_id?: string;
  credits: number;
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
  weapons: Weapon[];
  updated_at?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    gang_id,
    fighter_type_id,
    fighter_name,
    fighter_type,
    fighter_sub_type,
    fighter_sub_type_id,
    fighter_class,
    fighter_class_id,
  } = await request.json();

  console.log('Received data:', {
    gang_id,
    fighter_type_id,
    fighter_name,
    fighter_type,
    fighter_sub_type,
    fighter_sub_type_id,
    fighter_class,
  });

  if (!gang_id || !fighter_type_id || !fighter_name) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    // First, get the fighter type data
    const { data: fighterTypeData, error: fighterTypeError } = await supabase
      .from('fighter_types')
      .select('*')
      .eq('fighter_type_id', fighter_type_id)
      .single();

    if (fighterTypeError) throw fighterTypeError;

    const fighterCost = fighterTypeData.cost;

    // Get the current gang data
    const { data: currentGang, error: gangFetchError } = await supabase
      .from('gangs')
      .select('rating, credits')
      .eq('id', gang_id)
      .single();

    if (gangFetchError) throw gangFetchError;

    // Check if the gang has enough credits
    if ((currentGang.credits || 0) < fighterCost) {
      return NextResponse.json(
        { error: 'Not enough credits to add this fighter' },
        { status: 400 }
      );
    }

    // Now, insert the new fighter with all the statistics
    const { data: newFighter, error: fighterError } = await supabase
      .from('fighters')
      .insert([
        {
          gang_id,
          fighter_type_id: fighter_type_id === '' ? null : fighter_type_id,
          fighter_name,
          fighter_type,
          fighter_sub_type,
          fighter_sub_type_id:
            fighter_sub_type_id === '' ? null : fighter_sub_type_id,
          fighter_class,
          fighter_class_id: fighter_class_id === '' ? null : fighter_class_id,
          credits: fighterCost,
          movement: fighterTypeData.movement,
          weapon_skill: fighterTypeData.weapon_skill,
          ballistic_skill: fighterTypeData.ballistic_skill,
          strength: fighterTypeData.strength,
          toughness: fighterTypeData.toughness,
          wounds: fighterTypeData.wounds,
          initiative: fighterTypeData.initiative,
          attacks: fighterTypeData.attacks,
          leadership: fighterTypeData.leadership,
          cool: fighterTypeData.cool,
          willpower: fighterTypeData.willpower,
          intelligence: fighterTypeData.intelligence,
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (fighterError) throw fighterError;

    // Update the gang's rating, credits, and last_updated
    const { data: updatedGang, error: gangUpdateError } = await supabase
      .from('gangs')
      .update({
        rating: (currentGang.rating || 0) + fighterCost,
        credits: (currentGang.credits || 0) - fighterCost,
        last_updated: new Date().toISOString(),
      })
      .eq('id', gang_id)
      .select()
      .single();

    if (gangUpdateError) throw gangUpdateError;

    return NextResponse.json({
      fighter: {
        ...newFighter,
        fighter_id: newFighter.id,
        fighter_type: fighterTypeData.fighter_type,
      },
      gang: updatedGang,
    });
  } catch (error) {
    console.error('Error adding fighter and updating gang:', error);
    return NextResponse.json(
      { error: 'Failed to add fighter and update gang' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangId = searchParams.get('gang_id');

  if (!gangId) {
    return NextResponse.json({ error: 'Gang ID is required' }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    // Fetch fighters
    const { data: fighters, error: fightersError } = await supabase
      .from('fighters')
      .select(
        `
        id, 
        fighter_name, 
        fighter_type_id,
        fighter_type,
        fighter_sub_type,
        fighter_sub_type_id,
        fighter_class,
        fighter_class_id,
        credits,
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
        updated_at
      `
      )
      .eq('gang_id', gangId);

    if (fightersError) throw fightersError;

    // Fetch all fighter types
    const { data: fighterTypes, error: typesError } = await supabase
      .from('fighter_types')
      .select('fighter_type_id, fighter_type');

    if (typesError) throw typesError;

    // Create a map of fighter type ids to fighter types
    const fighterTypeMap = Object.fromEntries(
      fighterTypes.map((type) => [type.fighter_type_id, type.fighter_type])
    );

    // Fetch all fighter_weapons for the fetched fighters
    const { data: fighterWeapons, error: weaponsError } = await supabase
      .from('fighter_weapons')
      .select('fighter_id, weapon_id')
      .eq('fighter_id', gangId);

    if (weaponsError) throw weaponsError;

    // Fetch all weapons in one query
    const weaponIds = fighterWeapons.map((fw) => fw.weapon_id);
    const { data: weapons, error: weaponsDataError } = await supabase
      .from('weapons')
      .select(
        'id, weapon_name, range_short, range_long, acc_short, acc_long, strength, ap, damage, ammo, traits'
      )
      .in('id', weaponIds);

    if (weaponsDataError) throw weaponsDataError;

    // Create a map of weapon_id to weapon details
    const weaponMap: Record<string, Weapon> = {};
    weapons.forEach((weapon) => {
      weaponMap[weapon.id] = {
        weapon_id: weapon.id,
        weapon_name: weapon.weapon_name,
        range_short: weapon.range_short,
        range_long: weapon.range_long,
        acc_short: weapon.acc_short,
        acc_long: weapon.acc_long,
        strength: weapon.strength,
        ap: weapon.ap,
        damage: weapon.damage,
        ammo: weapon.ammo,
        traits: weapon.traits,
      };
    });

    // Create a map of fighter_id to weapons
    const fighterWeaponsMap: Record<string, Weapon[]> = {};
    fighterWeapons.forEach((fw) => {
      if (!fighterWeaponsMap[fw.fighter_id]) {
        fighterWeaponsMap[fw.fighter_id] = [];
      }
      if (weaponMap[fw.weapon_id]) {
        fighterWeaponsMap[fw.fighter_id].push(weaponMap[fw.weapon_id]);
      }
    });

    // Map fighters to include fighter_type and weapons
    const fightersWithTypes = fighters.map((fighter) => ({
      id: fighter.id,
      fighter_name: fighter.fighter_name,
      fighter_type_id: fighter.fighter_type_id,
      fighter_type: fighterTypeMap[fighter.fighter_type_id] || 'Unknown Type',
      fighter_sub_type: fighter.fighter_sub_type,
      fighter_sub_type_id: fighter.fighter_sub_type_id,
      fighter_class: fighter.fighter_class,
      fighter_class_id: fighter.fighter_class_id,
      credits: fighter.credits,
      movement: fighter.movement,
      weapon_skill: fighter.weapon_skill,
      ballistic_skill: fighter.ballistic_skill,
      strength: fighter.strength,
      toughness: fighter.toughness,
      wounds: fighter.wounds,
      initiative: fighter.initiative,
      leadership: fighter.leadership,
      cool: fighter.cool,
      willpower: fighter.willpower,
      intelligence: fighter.intelligence,
      attacks: fighter.attacks,
      updated_at: fighter.updated_at,
      weapons: fighterWeaponsMap[fighter.id] || [],
    }));

    // Log the final mapped data for debugging
    console.log(
      'Fighters with types and weapons:',
      JSON.stringify(fightersWithTypes, null, 2)
    );

    return NextResponse.json(fightersWithTypes);
  } catch (error) {
    console.error('Error fetching fighters:', error);
    return NextResponse.json(
      { error: 'Error fetching fighters' },
      { status: 500 }
    );
  }
}
