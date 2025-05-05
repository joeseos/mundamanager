import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

// Get all fighter types
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const equipment_id = searchParams.get('equipment_id');
  const fighter_type = searchParams.get('fighter_type');
  const fighter_class = searchParams.get('fighter_class');
  const gang_type_id = searchParams.get('gang_type_id');
  const filter_by_gang = searchParams.get('filter_by_gang') === 'true';

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
          fighter_sub_type_id,
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
          free_skill,
          is_gang_addition,
          equipment_discounts:equipment_discounts(
            equipment_id,
            discount
          )
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
          fighter_sub_type_id,
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
          free_skill,
          is_gang_addition,
          equipment_discounts:equipment_discounts(
            equipment_id,
            discount
          )
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

      // Fetch equipment selection
      const { data: equipmentSelection, error: equipmentSelectionError } = await supabase
        .from('fighter_equipment_selections')
        .select('equipment_selection')
        .eq('fighter_type_id', id)
        .single();

      if (equipmentSelectionError && equipmentSelectionError.code !== 'PGRST116') { // Ignore not found error
        console.error('Error fetching equipment selection:', equipmentSelectionError);
        throw equipmentSelectionError;
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

      // Fetch equipment list
      const { data: equipmentList, error: equipmentListError } = await supabase
        .from('fighter_type_equipment')
        .select('equipment_id')
        .eq('fighter_type_id', fighterType.id);

      if (equipmentListError) {
        console.error('Error fetching equipment list:', equipmentListError);
        throw equipmentListError;
      }

      // Fetch trading post equipment
      const { data: tradingPostData, error: tradingPostError } = await supabase
        .from('fighter_equipment_tradingpost')
        .select('equipment_tradingpost')
        .eq('fighter_type_id', fighterType.id)
        .single();

      if (tradingPostError && tradingPostError.code !== 'PGRST116') { // Ignore not found error
        console.error('Error fetching trading post equipment:', tradingPostError);
        throw tradingPostError;
      }

      const formattedFighterType = {
        ...fighterType,
        default_equipment: defaultEquipment?.map(d => d.equipment_id) || [],
        default_skills: defaultSkills?.map(d => d.skill_id) || [],
        equipment_list: equipmentList?.map(e => e.equipment_id) || [],
        equipment_discounts: fighterType.equipment_discounts?.map(d => ({
          equipment_id: d.equipment_id,
          discount: d.discount
        })) || [],
        equipment_selection: equipmentSelection?.equipment_selection || null,
        trading_post_equipment: tradingPostData?.equipment_tradingpost || []
      };

      return NextResponse.json(formattedFighterType);
    }

    // If direct fighter_type and fighter_class are provided, use those instead of ID lookup
    if (fighter_type && fighter_class) {
      console.log(`Direct search by fighter_type=${fighter_type} and fighter_class=${fighter_class}`);
      
      // Find all fighters with matching type and class with all details
      const { data: relatedFighterTypes, error: relatedError } = await supabase
        .from('fighter_types')
        .select(`
          id,
          fighter_type,
          gang_type_id,
          gang_type,
          fighter_class,
          fighter_sub_type_id,
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
          free_skill,
          is_gang_addition,
          equipment_discounts:equipment_discounts(
            equipment_id,
            discount
          )
        `)
        .eq('fighter_type', fighter_type)
        .eq('fighter_class', fighter_class);

      if (relatedError) {
        console.error('Error fetching related fighter types:', relatedError);
        throw relatedError;
      }

      console.log('Found fighters by name and class:', relatedFighterTypes?.length);
      
      if (!relatedFighterTypes || relatedFighterTypes.length === 0) {
        return NextResponse.json(
          { error: 'No fighter types found matching those criteria' },
          { status: 404 }
        );
      }
      
      // Get the fighter sub-types for these fighters
      const subTypeIds = relatedFighterTypes
        .map(ft => ft.fighter_sub_type_id)
        .filter(id => id !== null && id !== undefined) as string[];
      
      let subTypes: { id: string; sub_type_name: string; }[] = [];
      if (subTypeIds.length > 0) {
        const { data: subTypeData, error: subTypeError } = await supabase
          .from('fighter_sub_types')
          .select('*')
          .in('id', subTypeIds);

        if (subTypeError) {
          console.error('Error fetching sub-types:', subTypeError);
          throw subTypeError;
        } else {
          subTypes = subTypeData || [];
        }
      }
      
      // Get the complete data for each fighter
      const fighterDetails = await Promise.all(
        relatedFighterTypes.map(async (fighter: any) => {
          try {
            // Fetch default equipment
            const { data: defaultEquipment, error: equipmentError } = await supabase
              .from('fighter_defaults')
              .select('equipment_id')
              .eq('fighter_type_id', fighter.id)
              .not('equipment_id', 'is', null);

            if (equipmentError) {
              console.error('Error fetching default equipment:', equipmentError);
              throw equipmentError;
            }

            // Fetch default skills
            const { data: defaultSkills, error: skillsError } = await supabase
              .from('fighter_defaults')
              .select('skill_id')
              .eq('fighter_type_id', fighter.id)
              .not('skill_id', 'is', null);

            if (skillsError) {
              console.error('Error fetching default skills:', skillsError);
              throw skillsError;
            }

            // Fetch equipment list
            const { data: equipmentList, error: equipmentListError } = await supabase
              .from('fighter_type_equipment')
              .select('equipment_id')
              .eq('fighter_type_id', fighter.id);

            if (equipmentListError) {
              console.error('Error fetching equipment list:', equipmentListError);
              throw equipmentListError;
            }

            // Fetch equipment selection
            const { data: equipmentSelectionData, error: equipmentSelectionError } = await supabase
              .from('fighter_equipment_selections')
              .select('equipment_selection')
              .eq('fighter_type_id', fighter.id)
              .single();

            // Ignore not found error for equipment selection
            if (equipmentSelectionError && equipmentSelectionError.code !== 'PGRST116') {
              console.error('Error fetching equipment selection:', equipmentSelectionError);
              throw equipmentSelectionError;
            }

            // Fetch trading post equipment
            const { data: tradingPostData, error: tradingPostError } = await supabase
              .from('fighter_equipment_tradingpost')
              .select('equipment_tradingpost')
              .eq('fighter_type_id', fighter.id)
              .single();

            // Ignore not found error for trading post
            if (tradingPostError && tradingPostError.code !== 'PGRST116') {
              console.error('Error fetching trading post equipment:', tradingPostError);
              throw tradingPostError;
            }

            return {
              ...fighter,
              default_equipment: defaultEquipment?.map(d => d.equipment_id) || [],
              default_skills: defaultSkills?.map(d => d.skill_id) || [],
              equipment_list: equipmentList?.map(e => e.equipment_id) || [],
              equipment_discounts: fighter.equipment_discounts?.map((d: any) => ({
                equipment_id: d.equipment_id,
                discount: d.discount
              })) || [],
              equipment_selection: equipmentSelectionData?.equipment_selection || null,
              trading_post_equipment: tradingPostData?.equipment_tradingpost || [],
              is_default: !fighter.fighter_sub_type_id || fighter.fighter_sub_type_id === null
            };
          } catch (error) {
            console.error(`Error getting details for fighter ${fighter.id}:`, error);
            // Return basic fighter data if there's an error
            return {
              ...fighter,
              default_equipment: [],
              default_skills: [],
              equipment_list: [],
              equipment_discounts: [],
              equipment_selection: null,
              trading_post_equipment: [],
              is_default: !fighter.fighter_sub_type_id || fighter.fighter_sub_type_id === null
            };
          }
        })
      );
      
      // Sort fighters: Default first, then by sub-type name
      fighterDetails.sort((a, b) => {
        if (a.is_default && !b.is_default) return -1;
        if (!a.is_default && b.is_default) return 1;
        
        const aSubType = subTypes.find(st => st.id === a.fighter_sub_type_id);
        const bSubType = subTypes.find(st => st.id === b.fighter_sub_type_id);
        
        return (aSubType?.sub_type_name || '').localeCompare(bSubType?.sub_type_name || '');
      });
      
      console.log(`Returning ${fighterDetails.length} fighter details with ${subTypes.length} sub-types`);
      
      return NextResponse.json({
        fighter_type,
        fighter_class,
        fighters: fighterDetails,
        sub_types: subTypes
      });
    }

    // Default case - fetch all fighter types, with optional gang filtering
    let query = supabase
      .from('fighter_types')
      .select(`
        id,
        fighter_type,
        gang_type_id,
        gang_type,
        fighter_class,
        fighter_class_id,
        fighter_sub_type_id,
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
        free_skill,
        is_gang_addition,
        equipment_discounts:equipment_discounts(
          equipment_id,
          discount
        )
      `)
      .order('gang_type', { ascending: true })
      .order('fighter_type', { ascending: true });
    
    // Add gang type filter if requested and gang_type_id is provided
    if (filter_by_gang && gang_type_id) {
      console.log(`Filtering fighters by gang_type_id: ${gang_type_id}`);
      query = query.eq('gang_type_id', gang_type_id);
    }

    const { data: fighterTypes, error } = await query;

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
  const supabase = await createClient();
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
    console.log('Received update data:', data);

    // Update fighter type
    const { error: updateError } = await supabase
      .from('fighter_types')
      .update({
        fighter_type: data.fighter_type,
        cost: data.cost,
        gang_type_id: data.gang_type_id,
        fighter_class: data.fighter_class,
        fighter_class_id: data.fighter_class_id,
        fighter_sub_type_id: data.fighter_sub_type_id,
        fighter_sub_type: data.fighter_sub_type,
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
        free_skill: data.free_skill,
        is_gang_addition: data.is_gang_addition,
        updated_at: data.updated_at
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

    // Handle equipment list
    if (data.equipment_list) {
      // First delete existing equipment list entries
      const { error: deleteError } = await supabase
        .from('fighter_type_equipment')
        .delete()
        .eq('fighter_type_id', id);

      if (deleteError) throw deleteError;

      // Then insert new equipment list entries
      if (data.equipment_list.length > 0) {
        const equipmentList = data.equipment_list.map((equipment_id: string) => ({
          fighter_type_id: id,
          equipment_id
        }));

        const { error: insertError } = await supabase
          .from('fighter_type_equipment')
          .insert(equipmentList);

        if (insertError) throw insertError;
      }
    }

    // Handle equipment discounts
    if (data.equipment_discounts) {
      // First, delete existing discounts for this fighter type
      const { error: deleteError } = await supabase
        .from('equipment_discounts')
        .delete()
        .eq('fighter_type_id', id);

      if (deleteError) throw deleteError;

      // If there are new discounts to add
      if (data.equipment_discounts.length > 0) {
        const discountRecords = data.equipment_discounts.map((discount: {
          equipment_id: string;
          discount: number;
        }) => ({
          equipment_id: discount.equipment_id,
          fighter_type_id: id,
          discount: discount.discount.toString(),
          gang_type_id: null // Set to null since this is a fighter type discount
        }));

        if (discountRecords.length > 0) {
          const { error: insertError } = await supabase
            .from('equipment_discounts')
            .insert(discountRecords);

          if (insertError) throw insertError;
        }
      }
    }

    // Handle equipment selection
    if (data.equipment_selection) {
      // First delete any existing selection
      const { error: deleteError } = await supabase
        .from('fighter_equipment_selections')
        .delete()
        .eq('fighter_type_id', id);

      if (deleteError) throw deleteError;

      // Then insert the new selection if it has content
      if (data.equipment_selection.weapons) {
        const { error: insertError } = await supabase
          .from('fighter_equipment_selections')
          .insert({
            fighter_type_id: id,
            equipment_selection: data.equipment_selection
          });

        if (insertError) throw insertError;
      }
    }

    // Handle trading post equipment
    if (data.trading_post_equipment) {
      // First delete any existing trading post equipment for this fighter
      const { error: deleteError } = await supabase
        .from('fighter_equipment_tradingpost')
        .delete()
        .eq('fighter_type_id', id);

      if (deleteError) throw deleteError;

      // Then insert new trading post equipment if there are any selections
      if (data.trading_post_equipment.length > 0) {
        const { error: insertError } = await supabase
          .from('fighter_equipment_tradingpost')
          .insert({
            fighter_type_id: id,
            equipment_tradingpost: data.trading_post_equipment,
            updated_at: new Date().toISOString()
          });

        if (insertError) throw insertError;
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
  const supabase = await createClient();

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

    // Insert the fighter type
    const { data: newFighterType, error: insertError } = await supabase
      .from('fighter_types')
      .insert({
        fighter_type: data.fighterType,
        gang_type_id: data.gangTypeId,
        gang_type: gangType.gang_type,
        fighter_class: data.fighterClass,
        fighter_class_id: data.fighterClassId,
        fighter_sub_type_id: data.fighterSubTypeId,
        fighter_sub_type: data.fighterSubType,
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
        free_skill: data.free_skill,
        is_gang_addition: data.is_gang_addition
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Handle equipment discounts if provided
    if (data.equipment_discounts && data.equipment_discounts.length > 0) {
      const discountRecords = data.equipment_discounts.map((discount: {
        equipment_id: string;
        discount: number;
      }) => ({
        equipment_id: discount.equipment_id,
        fighter_type_id: newFighterType.id,
        discount: discount.discount.toString(),
        gang_type_id: null // Set to null since this is a fighter type discount
      }));

      const { error: discountError } = await supabase
        .from('equipment_discounts')
        .insert(discountRecords);

      if (discountError) throw discountError;
    }

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
        equipment_id: null
      }));

      const { error: skillError } = await supabase
        .from('fighter_defaults')
        .insert(skillDefaults);

      if (skillError) throw skillError;
    }

    // Add this section to handle equipment list
    if (data.equipment_list && data.equipment_list.length > 0) {
      const equipmentList = data.equipment_list.map((equipment_id: string) => ({
        fighter_type_id: newFighterType.id,
        equipment_id
      }));

      const { error: equipmentListError } = await supabase
        .from('fighter_type_equipment')
        .insert(equipmentList);

      if (equipmentListError) throw equipmentListError;
    }

    // Add this section to handle equipment selection
    if (data.equipment_selection) {
      if (data.equipment_selection.weapons) {
        const { error: insertError } = await supabase
          .from('fighter_equipment_selections')
          .insert({
            fighter_type_id: newFighterType.id,
            equipment_selection: data.equipment_selection
          });

        if (insertError) throw insertError;
      }
    }

    // Handle trading post equipment
    if (data.trading_post_equipment && data.trading_post_equipment.length > 0) {
      const { error: tradingPostError } = await supabase
        .from('fighter_equipment_tradingpost')
        .insert({
          fighter_type_id: newFighterType.id,
          equipment_tradingpost: data.trading_post_equipment,
          updated_at: new Date().toISOString()
        });

      if (tradingPostError) throw tradingPostError;
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

// Add PATCH method specifically for is_gang_addition
export async function PATCH(request: Request) {
  const supabase = await createClient();
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
    
    // Only allow updating the is_gang_addition field
    if (data.is_gang_addition === undefined) {
      return NextResponse.json({ error: 'is_gang_addition field is required' }, { status: 400 });
    }

    // Update only the is_gang_addition field
    const { error: updateError } = await supabase
      .from('fighter_types')
      .update({
        is_gang_addition: data.is_gang_addition
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating is_gang_addition:', updateError);
      throw updateError;
    }

    return NextResponse.json({ success: true, is_gang_addition: data.is_gang_addition });
  } catch (error) {
    console.error('Error in PATCH fighter-type:', error);
    return NextResponse.json(
      { 
        error: 'Error updating fighter type',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 