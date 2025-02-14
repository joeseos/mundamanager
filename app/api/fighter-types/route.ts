import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangTypeId = searchParams.get('gang_type_id');
  const isGangAddition = searchParams.get('is_gang_addition') === 'true';

  console.log('Received request for fighter types with gang_type_id:', gangTypeId);

  // For gang additions, always use the specific gang_type_id
  const effectiveGangTypeId = isGangAddition ? 
    'c3b4d7e8-149a-4cad-85fd-c06f0aa771eb' : 
    gangTypeId;

  if (!effectiveGangTypeId) {
    console.log('Error: Gang type ID is required');
    return NextResponse.json({ error: 'Gang type ID is required' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_fighter_types_with_cost`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          "p_gang_type_id": effectiveGangTypeId
        })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch fighter types');
    }

    const data = await response.json();

    // Format the response to match the expected interface
    const formattedTypes = data.map((type: any) => ({
      id: type.id,
      fighter_type_id: type.id,
      fighter_type: type.fighter_type,
      fighter_class: type.fighter_class,
      cost: type.cost,
      total_cost: type.total_cost || type.cost,
      movement: type.movement,
      weapon_skill: type.weapon_skill,
      ballistic_skill: type.ballistic_skill,
      strength: type.strength,
      toughness: type.toughness,
      wounds: type.wounds,
      initiative: type.initiative,
      attacks: type.attacks,
      leadership: type.leadership,
      cool: type.cool,
      willpower: type.willpower,
      intelligence: type.intelligence,
      special_rules: type.special_rules
    }));

    return NextResponse.json(formattedTypes);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to fetch fighter types' }, { status: 500 });
  }
}
