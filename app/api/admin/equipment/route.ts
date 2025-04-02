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
  damage: string;
  ammo: string;
  traits: string;
  is_default_profile: boolean;
  weapon_group_id?: string | null;
  sort_order: number;
}

interface VehicleProfile {
  profile_name: string;
  movement: string | null;
  front: string | null;
  side: string | null;
  rear: string | null;
  hull_points: string | null;
  save: string | null;
  upgrade_type: string | null;
  handling?: string | null;
}

interface FighterTypeEquipment {
  fighter_type_id: string;
  equipment_id: string;
}

interface GangDiscount {
  gang_type_id: string;
  discount: number;
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
      // Fetch equipment details
      const { data: equipment, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // First fetch the discounts
      const { data: discounts, error: discountsError } = await supabase
        .from('equipment_discounts')
        .select('discount, gang_type_id')
        .eq('equipment_id', id)
        .is('fighter_type_id', null);

      if (discountsError) throw discountsError;
      console.log('Fetched discounts:', discounts); // Debug log

      // Then fetch all gang types
      const { data: gangTypes, error: gangTypesError } = await supabase
        .from('gang_types')
        .select('gang_type_id, gang_type');

      if (gangTypesError) throw gangTypesError;
      console.log('Fetched gang types:', gangTypes); // Debug log

      // Create a map of gang type IDs to names
      const gangTypeMap = new Map(
        gangTypes.map((gt: { gang_type_id: string; gang_type: string }) => 
          [gt.gang_type_id, gt.gang_type]
        )
      );
      console.log('Gang type map:', Object.fromEntries(gangTypeMap)); // Debug log

      // Format the discounts with null check
      interface DiscountData {
        discount: string;
        gang_type_id: string | null;  // Allow null
      }

      const formattedDiscounts = (discounts as DiscountData[] || [])
        .filter(d => d.gang_type_id !== null)  // Filter out null gang_type_ids
        .map(d => ({
          gang_type: gangTypeMap.get(d.gang_type_id!) || '',  // Use non-null assertion since we filtered
          gang_type_id: d.gang_type_id!,
          discount: parseInt(d.discount)
        }));

      console.log('Formatted discounts:', formattedDiscounts); // Debug log

      // When fetching equipment details, include upgrade_type in the vehicle profiles query
      const { data: vehicleProfiles, error: vehicleProfilesError } = await supabase
        .from('vehicle_equipment_profiles')
        .select(`
          id,
          profile_name,
          movement,
          front,
          side,
          rear,
          hull_points,
          save,
          upgrade_type,
          handling
        `)
        .eq('equipment_id', id);

      if (vehicleProfilesError) throw vehicleProfilesError;
      console.log('Fetched vehicle profiles:', vehicleProfiles); // Debug log

      return NextResponse.json({
        ...equipment,
        gang_discounts: formattedDiscounts,
        vehicle_profiles: vehicleProfiles
      });

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

    const data = await request.json();
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
      vehicle_profiles
    } = data;

    // First get the category name from the ID
    const { data: categoryData, error: categoryError } = await supabase
      .from('equipment_categories')
      .select('category_name')
      .eq('id', equipment_category_id)
      .single();

    if (categoryError) throw categoryError;

    // Create the equipment
    const { data: equipment, error: equipmentError } = await supabase
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

    if (equipmentError) throw equipmentError;

    // If this is a weapon and has profiles, insert them
    if (equipment_type.toLowerCase() === 'weapon' && weapon_profiles && weapon_profiles.length > 0) {
      const weaponId = equipment.id;
      const cleanedWeaponProfiles = weapon_profiles.map((profile: WeaponProfile) => ({
        ...profile,
        weapon_id: weaponId,
        // Set weapon_group_id to either the selected weapon's ID or this weapon's ID
        weapon_group_id: profile.weapon_group_id || null,
        // Properly handle explicit null values
        range_short: profile.range_short === null ? '' : profile.range_short || '',
        range_long: profile.range_long === null ? '' : profile.range_long || '',
        acc_short: profile.acc_short === null ? '' : profile.acc_short || '',
        acc_long: profile.acc_long === null ? '' : profile.acc_long || '',
        strength: profile.strength === null ? '' : profile.strength || '',
        ap: profile.ap === null ? '' : profile.ap || '',
        damage: profile.damage === null ? '' : profile.damage || '',
        ammo: profile.ammo === null ? '' : profile.ammo || '',
        traits: profile.traits === null ? '' : profile.traits || ''
      }));

      const { error: profileError } = await supabase
        .from('weapon_profiles')
        .insert(cleanedWeaponProfiles);

      if (profileError) throw profileError;
    }

    // Handle vehicle profile if this is a vehicle upgrade
    if (equipment_type === 'vehicle_upgrade' && vehicle_profiles) {
      const { error: vehicleProfileError } = await supabase
        .from('vehicle_equipment_profiles')
        .insert({
          equipment_id: equipment.id,
          profile_name: vehicle_profiles[0].profile_name,
          movement: vehicle_profiles[0].movement || null,
          front: vehicle_profiles[0].front || null,
          side: vehicle_profiles[0].side || null,
          rear: vehicle_profiles[0].rear || null,
          hull_points: vehicle_profiles[0].hull_points || null,
          save: vehicle_profiles[0].save || null,
          handling: vehicle_profiles[0].handling || null,
          upgrade_type: vehicle_profiles[0].upgrade_type || null
        });

      if (vehicleProfileError) throw vehicleProfileError;
    }

    return NextResponse.json(equipment);
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
    const {
      equipment_name,
      trading_post_category,
      availability,
      cost,
      faction,
      variants,
      equipment_category,
      equipment_category_id,
      equipment_type,
      core_equipment,
      weapon_profiles,
      vehicle_profiles,
      fighter_types,
      gang_discounts
    } = data;

    // Update equipment
    const { error: equipmentError } = await supabase
      .from('equipment')
      .update({
        equipment_name,
        trading_post_category,
        availability,
        cost,
        faction,
        variants,
        equipment_category,
        equipment_category_id,
        equipment_type,
        core_equipment,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (equipmentError) throw equipmentError;

    // Handle weapon profiles if this is a weapon
    if (equipment_type === 'weapon' && weapon_profiles) {
      // Delete existing profiles
      const { error: deleteError } = await supabase
        .from('weapon_profiles')
        .delete()
        .eq('weapon_id', id);

      if (deleteError) throw deleteError;

      // Insert new profiles
      if (weapon_profiles.length > 0) {
        const { error: profilesError } = await supabase
          .from('weapon_profiles')
          .insert(
            weapon_profiles.map((profile: WeaponProfile) => ({
              weapon_id: id,
              profile_name: profile.profile_name,
              range_short: profile.range_short,
              range_long: profile.range_long,
              acc_short: profile.acc_short,
              acc_long: profile.acc_long,
              strength: profile.strength,
              ap: profile.ap,
              damage: profile.damage,
              ammo: profile.ammo,
              traits: profile.traits,
              is_default_profile: profile.is_default_profile,
              weapon_group_id: profile.weapon_group_id || id,
              sort_order: profile.sort_order
            }))
          );

        if (profilesError) throw profilesError;
      }
    }

    // Handle vehicle profiles if this is a vehicle upgrade
    if (equipment_type === 'vehicle_upgrade' && vehicle_profiles) {
      // Delete existing vehicle profiles
      const { error: deleteError } = await supabase
        .from('vehicle_equipment_profiles')
        .delete()
        .eq('equipment_id', id);

      if (deleteError) throw deleteError;

      // Insert new vehicle profiles
      if (vehicle_profiles.length > 0) {
        const { error: profilesError } = await supabase
          .from('vehicle_equipment_profiles')
          .insert(
            vehicle_profiles.map((profile: VehicleProfile) => ({
              equipment_id: id,
              profile_name: profile.profile_name,
              movement: profile.movement,
              front: profile.front,
              side: profile.side,
              rear: profile.rear,
              hull_points: profile.hull_points,
              save: profile.save,
              handling: profile.handling,
              upgrade_type: profile.upgrade_type
            }))
          );

        if (profilesError) throw profilesError;
      }
    }

    // More robust fighter type association handling
    if (fighter_types !== undefined) {
      console.log(`Updating fighter type associations for equipment ID: ${id}`);
      
      // First, get current associations to ensure we don't lose data
      const { data: currentAssociations, error: fetchError } = await supabase
        .from('fighter_type_equipment')
        .select('fighter_type_id')
        .eq('equipment_id', id);
      
      if (fetchError) {
        console.error('Error fetching current fighter type associations:', fetchError);
        // Continue with the operation even if this check fails
      }
      
      // Only proceed with deleting & updating if:
      // 1. We successfully fetched the current associations
      // 2. The new list is different from the current list
      if (currentAssociations) {
        const currentIds = currentAssociations.map(a => a.fighter_type_id);
        const hasChanges = JSON.stringify(currentIds.sort()) !== JSON.stringify([...fighter_types].sort());
        
        console.log(`Current associations: ${JSON.stringify(currentIds)}`);
        console.log(`New associations: ${JSON.stringify(fighter_types)}`);
        console.log(`Associations have changed: ${hasChanges}`);
        
        if (hasChanges) {
          // Delete existing associations
          const { error: deleteError } = await supabase
            .from('fighter_type_equipment')
            .delete()
            .eq('equipment_id', id);
          
          if (deleteError) throw deleteError;
          
          // Insert new associations if there are any
          if (fighter_types.length > 0) {
            const { error: insertError } = await supabase
              .from('fighter_type_equipment')
              .insert(
                fighter_types.map((fighter_type_id: string) => ({
                  fighter_type_id,
                  equipment_id: id,
                  updated_at: new Date().toISOString()
                }))
              );
            
            if (insertError) throw insertError;
          }
        } else {
          console.log('No changes to fighter type associations, preserving current data');
        }
      } else {
        console.log(`fighter_types not provided, preserving existing associations for ID: ${id}`);
      }
    }

    // Handle gang discounts
    if (gang_discounts) {
      // First, delete existing discounts for this equipment
      const { error: deleteError } = await supabase
        .from('equipment_discounts')
        .delete()
        .eq('equipment_id', id)
        .is('fighter_type_id', null); // Only delete gang-level discounts

      if (deleteError) throw deleteError;

      // If there are new discounts to add
      if (gang_discounts.length > 0) {
        // First get the gang type IDs
        const { data: gangTypes, error: gangTypesError } = await supabase
          .from('gang_types')
          .select('gang_type_id, gang_type');

        if (gangTypesError) throw gangTypesError;

        // Add proper typing for the gang type mapping
        interface GangTypeData {
          gang_type_id: string;
          gang_type: string;
        }

        // Create a map of gang type names to IDs with proper typing
        const gangTypeMap = new Map(
          (gangTypes as GangTypeData[]).map(gt => [gt.gang_type, gt.gang_type_id])
        );

        // Add type for the discount in the map function
        const discountRecords = gang_discounts.map((discount: GangDiscount) => ({
          equipment_id: id,
          gang_type_id: discount.gang_type_id,
          discount: discount.discount.toString(),
          fighter_type_id: null
        }));

        if (discountRecords.length > 0) {
          const { error: insertError } = await supabase
            .from('equipment_discounts')
            .insert(discountRecords);

          if (insertError) throw insertError;
        }
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error updating equipment:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update equipment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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
    const {
      equipment_name,
      trading_post_category,
      availability,
      cost,
      faction,
      variants,
      equipment_category,
      equipment_category_id,
      equipment_type,
      core_equipment,
      weapon_profiles,
      vehicle_profiles,
      fighter_types,
      gang_discounts
    } = data;

    // Update equipment
    const { error: equipmentError } = await supabase
      .from('equipment')
      .update({
        equipment_name,
        trading_post_category,
        availability,
        cost,
        faction,
        variants,
        equipment_category,
        equipment_category_id,
        equipment_type,
        core_equipment,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (equipmentError) throw equipmentError;

    // Handle weapon profiles if this is a weapon
    if (equipment_type === 'weapon' && weapon_profiles) {
      // Delete existing profiles
      const { error: deleteError } = await supabase
        .from('weapon_profiles')
        .delete()
        .eq('weapon_id', id);

      if (deleteError) throw deleteError;

      // Insert new profiles
      if (weapon_profiles.length > 0) {
        const { error: profilesError } = await supabase
          .from('weapon_profiles')
          .insert(
            weapon_profiles.map((profile: WeaponProfile) => ({
              weapon_id: id,
              profile_name: profile.profile_name,
              range_short: profile.range_short,
              range_long: profile.range_long,
              acc_short: profile.acc_short,
              acc_long: profile.acc_long,
              strength: profile.strength,
              ap: profile.ap,
              damage: profile.damage,
              ammo: profile.ammo,
              traits: profile.traits,
              is_default_profile: profile.is_default_profile,
              weapon_group_id: profile.weapon_group_id || id,
              sort_order: profile.sort_order
            }))
          );

        if (profilesError) throw profilesError;
      }
    }

    // Handle vehicle profiles if this is a vehicle upgrade
    if (equipment_type === 'vehicle_upgrade' && vehicle_profiles) {
      // Delete existing vehicle profiles
      const { error: deleteError } = await supabase
        .from('vehicle_equipment_profiles')
        .delete()
        .eq('equipment_id', id);

      if (deleteError) throw deleteError;

      // Insert new vehicle profiles
      if (vehicle_profiles.length > 0) {
        const { error: profilesError } = await supabase
          .from('vehicle_equipment_profiles')
          .insert(
            vehicle_profiles.map((profile: VehicleProfile) => ({
              equipment_id: id,
              profile_name: profile.profile_name,
              movement: profile.movement,
              front: profile.front,
              side: profile.side,
              rear: profile.rear,
              hull_points: profile.hull_points,
              save: profile.save,
              handling: profile.handling,
              upgrade_type: profile.upgrade_type
            }))
          );

        if (profilesError) throw profilesError;
      }
    }

    // More robust fighter type association handling
    if (fighter_types !== undefined) {
      console.log(`Updating fighter type associations for equipment ID: ${id}`);
      
      // First, get current associations to ensure we don't lose data
      const { data: currentAssociations, error: fetchError } = await supabase
        .from('fighter_type_equipment')
        .select('fighter_type_id')
        .eq('equipment_id', id);
      
      if (fetchError) {
        console.error('Error fetching current fighter type associations:', fetchError);
        // Continue with the operation even if this check fails
      }
      
      // Only proceed with deleting & updating if:
      // 1. We successfully fetched the current associations
      // 2. The new list is different from the current list
      if (currentAssociations) {
        const currentIds = currentAssociations.map(a => a.fighter_type_id);
        const hasChanges = JSON.stringify(currentIds.sort()) !== JSON.stringify([...fighter_types].sort());
        
        console.log(`Current associations: ${JSON.stringify(currentIds)}`);
        console.log(`New associations: ${JSON.stringify(fighter_types)}`);
        console.log(`Associations have changed: ${hasChanges}`);
        
        if (hasChanges) {
          // Delete existing associations
          const { error: deleteError } = await supabase
            .from('fighter_type_equipment')
            .delete()
            .eq('equipment_id', id);
          
          if (deleteError) throw deleteError;
          
          // Insert new associations if there are any
          if (fighter_types.length > 0) {
            const { error: insertError } = await supabase
              .from('fighter_type_equipment')
              .insert(
                fighter_types.map((fighter_type_id: string) => ({
                  fighter_type_id,
                  equipment_id: id,
                  updated_at: new Date().toISOString()
                }))
              );
            
            if (insertError) throw insertError;
          }
        } else {
          console.log('No changes to fighter type associations, preserving current data');
        }
      } else {
        console.log(`fighter_types not provided, preserving existing associations for ID: ${id}`);
      }
    }

    // Handle gang discounts
    if (gang_discounts) {
      // First, delete existing discounts for this equipment
      const { error: deleteError } = await supabase
        .from('equipment_discounts')
        .delete()
        .eq('equipment_id', id)
        .is('fighter_type_id', null); // Only delete gang-level discounts

      if (deleteError) throw deleteError;

      // If there are new discounts to add
      if (gang_discounts.length > 0) {
        // First get the gang type IDs
        const { data: gangTypes, error: gangTypesError } = await supabase
          .from('gang_types')
          .select('gang_type_id, gang_type');

        if (gangTypesError) throw gangTypesError;

        // Add proper typing for the gang type mapping
        interface GangTypeData {
          gang_type_id: string;
          gang_type: string;
        }

        // Create a map of gang type names to IDs with proper typing
        const gangTypeMap = new Map(
          (gangTypes as GangTypeData[]).map(gt => [gt.gang_type, gt.gang_type_id])
        );

        // Add type for the discount in the map function
        const discountRecords = gang_discounts.map((discount: GangDiscount) => ({
          equipment_id: id,
          gang_type_id: discount.gang_type_id,
          discount: discount.discount.toString(),
          fighter_type_id: null
        }));

        if (discountRecords.length > 0) {
          const { error: insertError } = await supabase
            .from('equipment_discounts')
            .insert(discountRecords);

          if (insertError) throw insertError;
        }
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error updating equipment:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update equipment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 