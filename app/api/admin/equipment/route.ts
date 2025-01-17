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
  weapon_group_id?: string | null;
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
      weapon_profiles,
      vehicle_profile
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
      const profilesWithIds = weapon_profiles.map((profile: WeaponProfile) => ({
        ...profile,
        weapon_id: weaponId,
        weapon_group_id: profile.weapon_group_id || weaponId,
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
        .insert(profilesWithIds);

      if (profileError) throw profileError;
    }

    // If this is a vehicle and has a profile, insert it
    if (equipment_type.toLowerCase() === 'vehicle' && vehicle_profile) {
      const { error: vehicleProfileError } = await supabase
        .from('vehicle_profiles')
        .insert({
          ...vehicle_profile,
          equipment_id: data.id,
          movement: vehicle_profile.movement || null,
          front: vehicle_profile.front || null,
          side: vehicle_profile.side || null,
          rear: vehicle_profile.rear || null,
          hp: vehicle_profile.hp || null,
          handling: vehicle_profile.handling || null,
          save: vehicle_profile.save || null
        });

      if (vehicleProfileError) throw vehicleProfileError;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in POST equipment:', error);
    return NextResponse.json(
      { 
        error: 'Error creating equipment',
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
        equipment_category_id: data.equipment_category_id,
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
              weapon_id: id,
              // Set weapon_group_id to either the selected weapon's ID or this weapon's ID
              weapon_group_id: profile.weapon_group_id || id
            }))
          );

        if (profilesError) throw profilesError;
      }
    }

    // If it's a vehicle, update the profile
    if (data.equipment_type.toLowerCase() === 'vehicle' && data.vehicle_profile) {
      // First delete existing profile
      const { error: deleteError } = await supabase
        .from('vehicle_profiles')
        .delete()
        .eq('equipment_id', id);

      if (deleteError) throw deleteError;

      // Then insert new profile
      const { error: vehicleProfileError } = await supabase
        .from('vehicle_profiles')
        .insert({
          ...data.vehicle_profile,
          equipment_id: id,
          movement: data.vehicle_profile.movement || null,
          front: data.vehicle_profile.front || null,
          side: data.vehicle_profile.side || null,
          rear: data.vehicle_profile.rear || null,
          hp: data.vehicle_profile.hp || null,
          handling: data.vehicle_profile.handling || null,
          save: data.vehicle_profile.save || null
        });

      if (vehicleProfileError) throw vehicleProfileError;
    }

    // Handle fighter type defaults
    if (data.fighter_types) {
      // First delete existing defaults for this equipment
      const { error: deleteError } = await supabase
        .from('fighter_defaults')
        .delete()
        .eq('equipment_id', id);

      if (deleteError) throw deleteError;

      // Then insert new defaults if any fighter types are selected
      if (data.fighter_types.length > 0) {
        const defaults = data.fighter_types.map((fighter_type_id: string) => ({
          equipment_id: id,
          fighter_type_id,
          skill_id: null // Since this is equipment, skill_id should be null
        }));

        const { error: insertError } = await supabase
          .from('fighter_defaults')
          .insert(defaults);

        if (insertError) throw insertError;
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