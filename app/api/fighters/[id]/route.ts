import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { cookies } from 'next/headers';
import { invalidateGangCredits } from '@/utils/cache-tags';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';

// Add Edge Function configurations
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const url = new URL(request.url);
  const injuryId = url.searchParams.get('injuryId');
  console.log("route in fighters")
  try {
    if (injuryId) {
      // Delete specific injury
      const { error: deleteError } = await supabase
        .from('fighter_injuries')
        .delete()
        .eq('id', injuryId);

      if (deleteError) throw deleteError;

      return NextResponse.json({ message: 'Injury deleted successfully' });
    }

    // Start a Supabase transaction
    const { data: fighter, error: fetchError } = await supabase
      .from('fighters')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError) throw fetchError;

    if (!fighter) {
      return NextResponse.json({ error: 'Fighter not found' }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from('fighters')
      .delete()
      .eq('id', params.id);

    if (deleteError) throw deleteError;

    // Calculate fighter total cost for rating/wealth update
    const { getFighterTotalCost } = await import('@/app/lib/shared/fighter-data');
    const fighterCost = await getFighterTotalCost(params.id, supabase);
    
    // Check if fighter was active (counts toward rating)
    const { countsTowardRating } = await import('@/utils/fighter-status');
    const wasActive = countsTowardRating(fighter);
    
    // Update gang rating and wealth using centralized helper
    const financialResult = await updateGangFinancials(supabase, {
      gangId: fighter.gang_id,
      ratingDelta: wasActive ? -fighterCost : 0
    });

    if (!financialResult.success) {
      throw new Error(financialResult.error || 'Failed to update gang financials');
    }

    // Invalidate gang rating cache
    invalidateGangCredits(fighter.gang_id);

    return NextResponse.json({ message: 'Fighter deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/fighters/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to process delete request' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const body = await request.json();
  const { 
    fighter_name, 
    label, 
    kills, 
    cost_adjustment, 
    fighter_class,
    fighter_class_id,
    fighter_type,
    fighter_type_id,
    fighter_sub_type,
    fighter_sub_type_id,
    xp_to_add, 
    operation, 
    note, 
    killed,
    retired,
    enslaved,
    starved,
    recovery,
    special_rules,
    sell_value
  } = body;

  try {
    // Validate label length if it's provided
    if (label !== undefined && label.length > 5) {
      return NextResponse.json(
        { error: 'Label must not exceed 5 characters' },
        { status: 400 }
      );
    }

    // If updating XP
    if (operation === 'add' && xp_to_add !== undefined) {
      // First get current XP values
      const { data: currentFighter, error: fetchError } = await supabase
        .from("fighters")
        .select('xp, total_xp')
        .eq('id', params.id)
        .single();

      if (fetchError) throw fetchError;

      const newXp = (currentFighter.xp || 0) + xp_to_add;
      const newTotalXp = (currentFighter.total_xp || 0) + xp_to_add;

      const { data: updatedFighter, error: updateError } = await supabase
        .from("fighters")
        .update({ 
          xp: newXp,
          total_xp: newTotalXp,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return NextResponse.json(updatedFighter);
    }

    // If updating fighter status (killed, retired, enslaved, starved)
    if (killed !== undefined || retired !== undefined || enslaved !== undefined || starved !== undefined || recovery !== undefined) {
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString()
      };
      
      if (killed !== undefined) updateData.killed = killed;
      if (retired !== undefined) updateData.retired = retired;
      if (enslaved !== undefined) updateData.enslaved = enslaved;
      if (starved !== undefined) updateData.starved = starved;
      if (recovery !== undefined) updateData.recovery = recovery;

      // If selling a fighter (enslaved = true and sell_value provided), add credits to gang
      if (enslaved === true && sell_value !== undefined && sell_value > 0) {
        // First get the fighter's gang_id and current gang credits
        const { data: fighter, error: fetchError } = await supabase
          .from("fighters")
          .select('gang_id')
          .eq('id', params.id)
          .single();

        if (fetchError) throw fetchError;

        // Get current gang credits
        const { data: gang, error: gangFetchError } = await supabase
          .from("gangs")
          .select('credits')
          .eq('id', fighter.gang_id)
          .single();

        if (gangFetchError) throw gangFetchError;

        // Calculate fighter cost for rating update
        const { getFighterTotalCost } = await import('@/app/lib/shared/fighter-data');
        const fighterCost = await getFighterTotalCost(params.id, supabase);
        
        // Check if fighter is active (counts toward rating)
        const { countsTowardRating } = await import('@/utils/fighter-status');
        const { data: fighterData } = await supabase
          .from("fighters")
          .select('killed, retired, enslaved, captured')
          .eq('id', params.id)
          .single();
        const isActive = countsTowardRating(fighterData);
        
        // Update gang credits, rating and wealth using centralized helper
        const financialResult = await updateGangFinancials(supabase, {
          gangId: fighter.gang_id,
          ratingDelta: isActive ? -fighterCost : 0,
          creditsDelta: sell_value
        });

        if (!financialResult.success) {
          throw new Error(financialResult.error || 'Failed to update gang financials');
        }
        
        // Update last_updated separately (not part of financials)
        await supabase
          .from("gangs")
          .update({ last_updated: new Date().toISOString() })
          .eq('id', fighter.gang_id);
      }

      const { data: updatedFighter, error: statusUpdateError } = await supabase
        .from("fighters")
        .update(updateData)
        .eq('id', params.id)
        .select()
        .single();

      if (statusUpdateError) throw statusUpdateError;
      return NextResponse.json(updatedFighter);
    }

    // If updating fighter data including type, sub-type, etc.
    if (fighter_name !== undefined || label !== undefined || kills !== undefined || 
        cost_adjustment !== undefined || note !== undefined || fighter_class !== undefined ||
        special_rules !== undefined || fighter_type !== undefined || fighter_type_id !== undefined ||
        fighter_sub_type !== undefined || fighter_sub_type_id !== undefined) {
      
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString()
      };
      
      if (fighter_name !== undefined) updateData.fighter_name = fighter_name.trimEnd();
      if (label !== undefined) updateData.label = label;
      if (kills !== undefined) updateData.kills = kills;
      if (cost_adjustment !== undefined) updateData.cost_adjustment = cost_adjustment;
      if (note !== undefined) updateData.note = note;
      if (fighter_class !== undefined) updateData.fighter_class = fighter_class;
      if (special_rules !== undefined) updateData.special_rules = special_rules;
      if (fighter_type !== undefined) updateData.fighter_type = fighter_type;
      
      // Handle UUID fields - convert empty strings to null to avoid UUID validation errors
      if (fighter_type_id !== undefined) {
        updateData.fighter_type_id = fighter_type_id === "" ? null : fighter_type_id;
      }
      if (fighter_sub_type_id !== undefined) {
        updateData.fighter_sub_type_id = fighter_sub_type_id === "" ? null : fighter_sub_type_id;
      }
      if (fighter_class_id !== undefined) {
        updateData.fighter_class_id = fighter_class_id === "" ? null : fighter_class_id;
      }
      
      if (fighter_sub_type !== undefined) updateData.fighter_sub_type = fighter_sub_type;

      const { data: updatedFighter, error: fighterUpdateError } = await supabase
        .from("fighters")
        .update(updateData)
        .eq('id', params.id)
        .select()
        .single();

      if (fighterUpdateError) throw fighterUpdateError;

      // Fetch the joined sub_type for nested response
      const { data: joinedFighter, error: joinError } = await supabase
        .from('fighters')
        .select(`*, fighter_sub_types: fighter_sub_type_id (id, sub_type_name)`)
        .eq('id', params.id)
        .single();

      if (joinError) throw joinError;

      // Normalize the sub_type as nested
      const nestedFighter = {
        ...joinedFighter,
        fighter_sub_type: joinedFighter.fighter_sub_types
          ? {
              fighter_sub_type: joinedFighter.fighter_sub_types.sub_type_name,
              fighter_sub_type_id: joinedFighter.fighter_sub_types.id
            }
          : null
      };
      delete nestedFighter.fighter_sub_types;

      return NextResponse.json(nestedFighter);
    }

    return NextResponse.json({ message: 'No changes to make' });
  } catch (error) {
    console.error('Error in PATCH handler:', error);
    return NextResponse.json(
      { error: 'Error updating fighter' },
      { status: 500 }
    );
  }
}
