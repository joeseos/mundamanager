import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const { fighter_id, weapon_id } = await request.json();

    // Validate the input
    if (!fighter_id || !weapon_id) {
      return NextResponse.json(
        { error: 'Missing fighter_id or weapon_id' },
        { status: 400 }
      );
    }

    // Insert the relation into the fighter_weapons table
    const { data, error } = await supabase
      .from('fighter_weapons')
      .insert({ fighter_id, weapon_id })
      .select();

    if (error) throw error;

    return NextResponse.json(
      { message: 'Weapon added successfully', data },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding weapon to fighter:', error);
    return NextResponse.json(
      { error: 'Failed to add weapon to fighter' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const fighterId = searchParams.get('fighter_id');

  if (!fighterId) {
    return NextResponse.json({ error: 'Missing fighter_id' }, { status: 400 });
  }

  try {
    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First, get the weapon IDs for the fighter
    const { data: fighterWeapons, error: fighterWeaponsError } = await supabase
      .from('fighter_weapons')
      .select('weapon_id')
      .eq('fighter_id', fighterId);

    if (fighterWeaponsError) throw fighterWeaponsError;

    if (!fighterWeapons || fighterWeapons.length === 0) {
      return NextResponse.json([]);
    }

    // Extract weapon IDs
    const weaponIds = fighterWeapons.map((fw) => fw.weapon_id);

    // Now, fetch the details for these weapons
    const { data: weapons, error: weaponsError } = await supabase
      .from('weapons')
      .select('id, weapon_name, cost')
      .in('id', weaponIds);

    if (weaponsError) throw weaponsError;

    // Combine the data
    const formattedData = weapons.map((weapon) => ({
      id: weapon.id,
      weapon_name: weapon.weapon_name,
      cost: weapon.cost,
    }));

    return NextResponse.json(formattedData);
  } catch (error) {
    console.error('Error fetching fighter weapons:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fighter weapons' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const fighterId = searchParams.get('fighter_id');
  const weaponId = searchParams.get('weapon_id');
  const action = searchParams.get('action');

  if (!fighterId || !weaponId) {
    return NextResponse.json(
      { error: 'Missing fighter_id or weapon_id' },
      { status: 400 }
    );
  }

  if (action !== 'delete' && action !== 'sell') {
    return NextResponse.json(
      { error: 'Invalid or missing action' },
      { status: 400 }
    );
  }

  try {
    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the weapon cost
    const { data: weapon, error: weaponError } = await supabase
      .from('weapons')
      .select('cost')
      .eq('id', weaponId)
      .single();

    if (weaponError) throw weaponError;

    // Delete the weapon from fighter_weapons
    const { error: deleteError } = await supabase
      .from('fighter_weapons')
      .delete()
      .match({ fighter_id: fighterId, weapon_id: weaponId });

    if (deleteError) throw deleteError;

    // Get current fighter data
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('credits, gang_id')
      .eq('id', fighterId)
      .single();

    if (fighterError) throw fighterError;

    // Calculate new credits (reduce credits for both delete and sell)
    const newFighterCredits = Math.max(0, fighter.credits - weapon.cost);

    // Update fighter credits
    const { data: updatedFighter, error: updateFighterError } = await supabase
      .from('fighters')
      .update({ credits: newFighterCredits })
      .eq('id', fighterId)
      .select('credits')
      .single();

    if (updateFighterError) throw updateFighterError;

    if (action === 'sell') {
      // Get current gang credits
      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('credits')
        .eq('id', fighter.gang_id)
        .single();

      if (gangError) throw gangError;

      // Update gang credits
      const { error: updateGangError } = await supabase
        .from('gangs')
        .update({ credits: gang.credits + weapon.cost })
        .eq('id', fighter.gang_id);

      if (updateGangError) throw updateGangError;
    }

    return NextResponse.json(
      {
        message:
          action === 'delete'
            ? 'Weapon deleted and fighter credits updated successfully'
            : 'Weapon sold, fighter credits reduced, and gang credits updated successfully',
        credits: updatedFighter.credits,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error processing weapon action:', error);
    return NextResponse.json(
      { error: `Failed to ${action} weapon and update credits` },
      { status: 500 }
    );
  }
}
