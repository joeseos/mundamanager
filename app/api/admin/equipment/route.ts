import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

interface WeaponProfile {
  profile_name: string;
  range_short: string;
  range_long: string;
  acc_short: string;
  acc_long: string;
  strength: string;
  ap: string;
  damage: number;
  ammo: string;
  traits: string;
  is_default_profile: boolean;
}

export async function GET(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const equipment_category = searchParams.get('equipment_category');
  const id = searchParams.get('id');

  // Check admin authorization
  const isAdmin = await checkAdmin(supabase);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (id) {
      // Handle single equipment fetch
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return NextResponse.json(data);

    } else if (equipment_category) {
      // Return equipment filtered by category
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('equipment_category', equipment_category)
        .order('equipment_name');

      if (error) throw error;
      return NextResponse.json(data);

    } else {
      // Return all equipment when no filters are provided
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('equipment_name');

      if (error) throw error;
      return NextResponse.json(data);
    }
  } catch (error) {
    console.error('Error in GET equipment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch equipment' },
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

    const body = await request.json();
    const {
      equipment_name,
      trading_post_category,
      availability,
      cost,
      faction,
      variants,
      equipment_category_id,
      equipment_type,
      core_equipment,
      weapon_profiles
    } = body;

    // First get the category name from the ID
    const { data: categoryData, error: categoryError } = await supabase
      .from('equipment_categories')
      .select('category_name')
      .eq('id', equipment_category_id)
      .single();

    if (categoryError) throw categoryError;

    // Create the equipment
    const { data, error } = await supabase
      .from('equipment')
      .insert({
        equipment_name,
        trading_post_category,
        availability,
        cost,
        faction,
        variants,
        equipment_category: categoryData.category_name,
        equipment_category_id,
        equipment_type: equipment_type.toLowerCase(),
        core_equipment
      })
      .select()
      .single();

    if (error) throw error;

    // If this is a weapon and has profiles, insert them
    if (equipment_type.toLowerCase() === 'weapon' && weapon_profiles && weapon_profiles.length > 0) {
      const weaponId = data.id;
      const profilesWithWeaponId = weapon_profiles.map((profile: WeaponProfile) => ({
        ...profile,
        weapon_id: weaponId,
        // Ensure numeric fields are properly handled
        damage: profile.damage || null,
        range_short: profile.range_short || null,
        range_long: profile.range_long || null,
        acc_short: profile.acc_short || null,
        acc_long: profile.acc_long || null,
        strength: profile.strength || null,
        ap: profile.ap || null,
        ammo: profile.ammo || null,
        traits: profile.traits || null
      }));

      const { error: profileError } = await supabase
        .from('weapon_profiles')
        .insert(profilesWithWeaponId);

      if (profileError) throw profileError;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in POST equipment:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create equipment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 });
  }

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    console.log('Received equipment update data:', data);

    // Update equipment
    const { error: equipmentError } = await supabase
      .from('equipment')
      .update({
        equipment_name: data.equipment_name,
        trading_post_category: data.trading_post_category,
        availability: data.availability,
        cost: data.cost,
        faction: data.faction,
        variants: data.variants,
        equipment_category: data.equipment_category,
        equipment_type: data.equipment_type,
        core_equipment: data.core_equipment
      })
      .eq('id', id);

    if (equipmentError) throw equipmentError;

    // If it's a weapon, update the profiles
    if (data.equipment_type.toLowerCase() === 'weapon') {
      console.log('Updating weapon profiles:', data.weapon_profiles);
      // Delete existing profiles
      const { error: deleteError } = await supabase
        .from('weapon_profiles')
        .delete()
        .eq('weapon_id', id);

      if (deleteError) throw deleteError;

      // Insert new profiles if any
      if (data.weapon_profiles?.length > 0) {
        const { error: profilesError } = await supabase
          .from('weapon_profiles')
          .insert(
            data.weapon_profiles.map((profile: WeaponProfile) => ({
              ...profile,
              weapon_id: id
            }))
          );

        if (profilesError) throw profilesError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PUT equipment:', error);
    return NextResponse.json(
      { 
        error: 'Error updating equipment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 