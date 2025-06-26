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
  weapon_group_id?: string | null;
  sort_order: number;
}

interface FighterTypeEquipment {
  fighter_type_id: string;
  equipment_id: string;
}

interface GangAdjustedCost {
  gang_type_id: string;
  adjusted_cost: number;
}

interface EquipmentAvailability {
  gang_type_id: string;
  availability: string;
}

export async function GET(request: Request) {
  const supabase = await createClient();
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

      // First fetch the adjustedCosts
      const { data: adjustedCosts, error: adjustedCostsError } = await supabase
        .from('equipment_discounts')
        .select('adjusted_cost, gang_type_id')
        .eq('equipment_id', id)
        .is('fighter_type_id', null);

      if (adjustedCostsError) throw adjustedCostsError;
      console.log('Fetched adjustedCosts:', adjustedCosts);

      // Fetch equipment availabilities
      const { data: availabilities, error: availabilitiesError } = await supabase
        .from('equipment_availability')
        .select('availability, gang_type_id')
        .eq('equipment_id', id);

      // Don't throw error if the query fails or returns empty, just log it
      if (availabilitiesError) {
        console.warn('Error fetching from equipment_availability:', availabilitiesError);
      }
      
      console.log('Fetched availabilities:', availabilities || []);

      // Fetch trading post associations
      const { data: tradingPostAssociations, error: tradingPostError } = await supabase
        .from('trading_post_equipment')
        .select('trading_post_type_id')
        .eq('equipment_id', id);

      // Don't throw error if the query fails, just log it
      if (tradingPostError) {
        console.warn('Error fetching trading post associations:', tradingPostError);
      }

      console.log('Fetched trading post associations:', tradingPostAssociations || []);

      // Then fetch all gang types
      const { data: gangTypes, error: gangTypesError } = await supabase
        .from('gang_types')
        .select('gang_type_id, gang_type');

      if (gangTypesError) throw gangTypesError;
      console.log('Fetched gang types:', gangTypes);

      // Create a map of gang type IDs to names
      const gangTypeMap = new Map(
        gangTypes.map((gt: { gang_type_id: string; gang_type: string }) => 
          [gt.gang_type_id, gt.gang_type]
        )
      );
      console.log('Gang type map:', Object.fromEntries(gangTypeMap));

      // Format the adjustedCosts with null check
      interface AdjustedCostData {
        adjusted_cost: string;
        gang_type_id: string | null;
      }

      const formattedAdjustedCosts = (adjustedCosts as AdjustedCostData[] || [])
        .filter(d => d.gang_type_id !== null)
        .map(d => ({
          gang_type: gangTypeMap.get(d.gang_type_id!) || '',
          gang_type_id: d.gang_type_id!,
          adjusted_cost: parseInt(d.adjusted_cost)
        }));

      console.log('Formatted adjustedCosts:', formattedAdjustedCosts);

      // Format the availabilities with null check
      interface AvailabilityData {
        availability: string;
        gang_type_id: string | null;
      }

      const formattedAvailabilities = (availabilities as AvailabilityData[] || [])
        .filter(a => a && a.gang_type_id !== null)
        .map(a => ({
          gang_type: gangTypeMap.get(a.gang_type_id!) || '',
          gang_type_id: a.gang_type_id!,
          availability: a.availability
        }));

      console.log('Formatted availabilities:', formattedAvailabilities);

      // Format trading post associations
      const tradingPostIds = (tradingPostAssociations || []).map(tp => tp.trading_post_type_id);
      console.log('Trading post IDs:', tradingPostIds);

      // Fetch trading post types for the component to display names
      const { data: tradingPostTypes, error: tradingPostTypesError } = await supabase
        .from('trading_post_types')
        .select('id, trading_post_name')
        .order('trading_post_name');

      // Don't throw error if the query fails, just log it
      if (tradingPostTypesError) {
        console.warn('Error fetching trading post types:', tradingPostTypesError);
      }

      console.log('Fetched trading post types:', tradingPostTypes || []);

      return NextResponse.json({
        ...equipment,
        gang_adjusted_costs: formattedAdjustedCosts,
        equipment_availabilities: formattedAvailabilities || [],
        trading_post_associations: tradingPostIds,
        trading_post_types: tradingPostTypes || [],
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
  const supabase = await createClient();

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
      fighter_types,
      gang_adjusted_costs,
      equipment_availabilities
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

    // Handle fighter types if provided
    if (fighter_types && fighter_types.length > 0) {
      const { error: fighterTypesError } = await supabase
        .from('fighter_type_equipment')
        .insert(
          fighter_types.map((fighter_type_id: string) => ({
            fighter_type_id,
            equipment_id: equipment.id,
            updated_at: new Date().toISOString()
          }))
        );
      
      if (fighterTypesError) throw fighterTypesError;
    }

    // Handle gang adjustedCosts if provided
    if (gang_adjusted_costs && gang_adjusted_costs.length > 0) {
      const adjustedCostRecords = gang_adjusted_costs.map((adjusted_cost: GangAdjustedCost) => ({
        equipment_id: equipment.id,
        gang_type_id: adjusted_cost.gang_type_id,
        adjusted_cost: adjusted_cost.adjusted_cost.toString(),
        fighter_type_id: null
      }));

      const { error: adjustedCostsError } = await supabase
        .from('equipment_discounts')
        .insert(adjustedCostRecords);
      
      if (adjustedCostsError) throw adjustedCostsError;
    }

    // Handle equipment availabilities if provided
    if (equipment_availabilities && equipment_availabilities.length > 0) {
      const availabilityRecords = equipment_availabilities.map((avail: EquipmentAvailability) => ({
        equipment_id: equipment.id,
        gang_type_id: avail.gang_type_id,
        availability: avail.availability
      }));

      const { error: availabilityError } = await supabase
        .from('equipment_availability')
        .insert(availabilityRecords);
      
      // Log but don't throw on insert error for availabilities
      if (availabilityError) {
        console.warn('Error inserting into equipment_availability:', availabilityError);
      }
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
  const supabase = await createClient();
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
      fighter_types,
      gang_adjusted_costs
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
              weapon_group_id: profile.weapon_group_id || id,
              sort_order: profile.sort_order
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

    // Handle Gang adjustedCosts
    if (gang_adjusted_costs) {
      // First, delete existing adjustedCosts for this equipment
      const { error: deleteError } = await supabase
        .from('equipment_discounts')
        .delete()
        .eq('equipment_id', id)
        .is('fighter_type_id', null); // Only delete gang-level adjustedCosts

      if (deleteError) throw deleteError;

      // If there are new adjustedCosts to add
      if (gang_adjusted_costs.length > 0) {
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

        // Add type for the adjustedCost in the map function
        const adjustedCostRecords = gang_adjusted_costs.map((adjusted_cost: GangAdjustedCost) => ({
          equipment_id: id,
          gang_type_id: adjusted_cost.gang_type_id,
          adjusted_cost: adjusted_cost.adjusted_cost.toString(),
          fighter_type_id: null
        }));

        if (adjustedCostRecords.length > 0) {
          const { error: insertError } = await supabase
            .from('equipment_discounts')
            .insert(adjustedCostRecords);

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
  const supabase = await createClient();
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
      fighter_types,
      gang_adjusted_costs,
      equipment_availabilities,
      fighter_effects
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
              weapon_group_id: profile.weapon_group_id || id,
              sort_order: profile.sort_order
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

    // Handle Gang adjustedCosts
    if (gang_adjusted_costs) {
      // First, delete existing adjustedCosts for this equipment
      const { error: deleteError } = await supabase
        .from('equipment_discounts')
        .delete()
        .eq('equipment_id', id)
        .is('fighter_type_id', null); // Only delete gang-level adjustedCosts

      if (deleteError) throw deleteError;

      // If there are new adjustedCosts to add
      if (gang_adjusted_costs.length > 0) {
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

        // Add type for the adjusted_cost in the map function
        const adjustedCostRecords = gang_adjusted_costs.map((adjusted_cost: GangAdjustedCost) => ({
          equipment_id: id,
          gang_type_id: adjusted_cost.gang_type_id,
          adjusted_cost: adjusted_cost.adjusted_cost.toString(),
          fighter_type_id: null
        }));

        if (adjustedCostRecords.length > 0) {
          const { error: insertError } = await supabase
            .from('equipment_discounts')
            .insert(adjustedCostRecords);

          if (insertError) throw insertError;
        }
      }
    }

    // Handle equipment availabilities
    if (equipment_availabilities !== undefined) {
      // First, delete all existing availabilities for this equipment
      const { error: deleteError } = await supabase
        .from('equipment_availability')
        .delete()
        .eq('equipment_id', id);

      // Log but don't throw on delete error
      if (deleteError) {
        console.warn('Error deleting from equipment_availability:', deleteError);
      }

      // If there are new availabilities to add
      if (Array.isArray(equipment_availabilities) && equipment_availabilities.length > 0) {
        const availabilityRecords = equipment_availabilities.map((avail: EquipmentAvailability) => ({
          equipment_id: id,
          gang_type_id: avail.gang_type_id,
          availability: avail.availability
        }));

        if (availabilityRecords.length > 0) {
          const { error: insertError } = await supabase
            .from('equipment_availability')
            .insert(availabilityRecords);

          // Log but don't throw on insert error
          if (insertError) {
            console.warn('Error inserting into equipment_availability:', insertError);
          }
        }
      }
    }

    // Handle fighter effects if provided
    if (fighter_effects !== undefined) {
      console.log('Handling fighter effects for equipment:', id);
      console.log('fighter_effects:', JSON.stringify(fighter_effects));
      console.log('fighter_effects.length:', fighter_effects.length);

      if (Array.isArray(fighter_effects)) {
        // Get existing effect IDs for this equipment to determine what to delete
        console.log('Querying for existing effects with equipment_id:', id);
        const { data: existingEffects, error: fetchError } = await supabase
          .from('fighter_effect_types')
          .select('id, effect_name, type_specific_data')
          .eq('type_specific_data->equipment_id', id);

        console.log('Existing effects query result:', { existingEffects, fetchError });

        // If the JSON operator query fails or returns no results, try a broader query
        let finalExistingEffects = existingEffects;
        if (!existingEffects || existingEffects.length === 0) {
          console.log('Trying alternative query method...');
          const { data: allEffects, error: allEffectsError } = await supabase
            .from('fighter_effect_types')
            .select('id, effect_name, type_specific_data')
            .not('type_specific_data', 'is', null);

          if (!allEffectsError && allEffects) {
            // Filter manually for effects that have this equipment_id
            finalExistingEffects = allEffects.filter(effect => {
              try {
                const typeData = effect.type_specific_data;
                return typeData && 
                       typeof typeData === 'object' && 
                       'equipment_id' in typeData && 
                       typeData.equipment_id === id;
              } catch (e) {
                console.error('Error parsing type_specific_data:', e);
                return false;
              }
            });
            console.log('Alternative query found effects:', finalExistingEffects?.length || 0);
          }
        }

        if (finalExistingEffects && finalExistingEffects.length > 0) {
          // Create a set of current effect IDs from the request
          const currentEffectIds = new Set(fighter_effects.map(effect => effect.id));
          console.log('Current effect IDs from request:', Array.from(currentEffectIds));
          
          // Find effects to delete (existing effects not in the current list)
          const effectsToDelete = (finalExistingEffects || [])
            .filter(existing => existing.id && !currentEffectIds.has(existing.id))
            .map(effect => effect.id);
          
          console.log('Effects to delete:', effectsToDelete);
          
          // Delete effects that are no longer in the list
          if (effectsToDelete.length > 0) {
            console.log('Deleting removed effects:', effectsToDelete);
            
            // First delete associated modifiers
            for (const effectId of effectsToDelete) {
              console.log('Deleting modifiers for effect:', effectId);
              const { error: deleteModifiersError } = await supabase
                .from('fighter_effect_type_modifiers')
                .delete()
                .eq('fighter_effect_type_id', effectId);
              
              if (deleteModifiersError) {
                console.error('Error deleting modifiers for effect', effectId, ':', deleteModifiersError);
              } else {
                console.log('Successfully deleted modifiers for effect:', effectId);
              }
            }
            
            // Then delete the effects themselves
            console.log('Deleting effects:', effectsToDelete);
            const { error: deleteEffectsError } = await supabase
              .from('fighter_effect_types')
              .delete()
              .in('id', effectsToDelete);
            
            if (deleteEffectsError) {
              console.error('Error deleting effects:', deleteEffectsError);
            } else {
              console.log('Successfully deleted effects:', effectsToDelete);
            }
          } else if (fighter_effects.length === 0 && finalExistingEffects && finalExistingEffects.length > 0) {
            // Special case: if fighter_effects is empty but we have existing effects, delete all
            console.log('Removing all fighter effects for equipment:', id);
            const allEffectIds = finalExistingEffects.map(effect => effect.id);
            console.log('All effect IDs to delete:', allEffectIds);
            
            // First delete associated modifiers
            for (const effectId of allEffectIds) {
              console.log('Deleting modifiers for effect:', effectId);
              const { error: deleteModifiersError } = await supabase
                .from('fighter_effect_type_modifiers')
                .delete()
                .eq('fighter_effect_type_id', effectId);
              
              if (deleteModifiersError) {
                console.error('Error deleting modifiers for effect', effectId, ':', deleteModifiersError);
              } else {
                console.log('Successfully deleted modifiers for effect:', effectId);
              }
            }
            
            // Then delete all effects
            console.log('Deleting all effects:', allEffectIds);
            const { error: deleteAllEffectsError } = await supabase
              .from('fighter_effect_types')
              .delete()
              .in('id', allEffectIds);
            
            if (deleteAllEffectsError) {
              console.error('Error deleting all effects:', deleteAllEffectsError);
            } else {
              console.log('Successfully deleted all effects for equipment:', id);
            }
          } else {
            console.log('No effects to delete. fighter_effects.length:', fighter_effects.length, 'existingEffects.length:', finalExistingEffects?.length || 0);
          }
        }
      }

      // Process fighter effects (only if there are effects to process)
      if (fighter_effects.length > 0) {
        console.log('Processing', fighter_effects.length, 'fighter effects');
        for (const effect of fighter_effects) {
          const isNewEffect = effect.id.indexOf('temp-') === 0;
          
          if (isNewEffect) {
            // Create new effect
            console.log('Creating new fighter effect for equipment:', id);
            
            // Create fighter effect type
            const { data: newEffect, error: createEffectError } = await supabase
              .from('fighter_effect_types')
              .insert({
                effect_name: effect.effect_name,
                fighter_effect_category_id: effect.fighter_effect_category_id,
                type_specific_data: { equipment_id: id }
              })
              .select()
              .single();
            
            if (createEffectError) {
              console.error('Error creating fighter effect:', createEffectError);
              continue; // Skip to next effect
            }
            
            // Create modifiers for this effect
            if (effect.modifiers && effect.modifiers.length > 0) {
              const modifiersToCreate = effect.modifiers.map((modifier: any) => ({
                fighter_effect_type_id: newEffect.id,
                stat_name: modifier.stat_name,
                default_numeric_value: modifier.default_numeric_value
              }));
              
              const { error: createModifiersError } = await supabase
                .from('fighter_effect_type_modifiers')
                .insert(modifiersToCreate);
              
              if (createModifiersError) {
                console.error('Error creating modifiers:', createModifiersError);
              }
            }
          } else {
            // Handle existing effect and its modifiers
            console.log('Handling existing fighter effect:', effect.id);
            
            // First update the effect
            const { error: updateEffectError } = await supabase
              .from('fighter_effect_types')
              .update({
                effect_name: effect.effect_name,
                fighter_effect_category_id: effect.fighter_effect_category_id,
                type_specific_data: { equipment_id: id }
              })
              .eq('id', effect.id);
            
            if (updateEffectError) {
              console.error('Error updating fighter effect:', updateEffectError);
              continue; // Skip to next effect
            }
            
            if (effect.modifiers) {
              // Get existing modifiers for this effect
              const { data: existingModifiers, error: fetchModifiersError } = await supabase
                .from('fighter_effect_type_modifiers')
                .select('id')
                .eq('fighter_effect_type_id', effect.id);
              
              if (fetchModifiersError) {
                console.error('Error fetching existing modifiers:', fetchModifiersError);
              } else {
                // Create a set of current modifier IDs from the request
                const currentModifierIds = new Set(
                  effect.modifiers
                    .filter((mod: any) => mod.id && mod.id.indexOf('temp-') !== 0)
                    .map((mod: any) => mod.id)
                );
                
                // Find modifiers to delete (existing modifiers not in the current list)
                const modifiersToDelete = (existingModifiers || [])
                  .filter(existing => existing.id && !currentModifierIds.has(existing.id))
                  .map(modifier => modifier.id);
                
                // Delete modifiers that are no longer in the list
                if (modifiersToDelete.length > 0) {
                  console.log('Deleting removed modifiers:', modifiersToDelete);
                  
                  const { error: deleteModifiersError } = await supabase
                    .from('fighter_effect_type_modifiers')
                    .delete()
                    .in('id', modifiersToDelete);
                  
                  if (deleteModifiersError) {
                    console.error('Error deleting modifiers:', deleteModifiersError);
                  }
                }
              }
              
              // Handle individual modifiers
              for (const modifier of effect.modifiers) {
                const isNewModifier = !modifier.id || modifier.id.indexOf('temp-') === 0;
                
                if (isNewModifier) {
                  // Create new modifier
                  const { error: createModifierError } = await supabase
                    .from('fighter_effect_type_modifiers')
                    .insert({
                      fighter_effect_type_id: effect.id,
                      stat_name: modifier.stat_name,
                      default_numeric_value: modifier.default_numeric_value
                    });
                  
                  if (createModifierError) {
                    console.error('Error creating modifier:', createModifierError);
                  }
                } else {
                  // Update existing modifier
                  const { error: updateModifierError } = await supabase
                    .from('fighter_effect_type_modifiers')
                    .update({
                      stat_name: modifier.stat_name,
                      default_numeric_value: modifier.default_numeric_value
                    })
                    .eq('id', modifier.id);
                  
                  if (updateModifierError) {
                    console.error('Error updating modifier:', updateModifierError);
                  }
                }
              }
            }
          }
        }
      } else {
        console.log('No fighter effects to process (length is 0)');
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