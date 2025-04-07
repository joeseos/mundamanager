import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { cookies } from 'next/headers';

// Add Edge Function configurations
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
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

    // Update gang credits
    const { error: updateError } = await supabase
      .from('gangs')
      .update({ credits: fighter.credits })
      .eq('id', fighter.gang_id);

    if (updateError) throw updateError;

    return NextResponse.json({ message: 'Fighter deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/fighters/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to process delete request' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const body = await request.json();
  const { 
    fighter_name, 
    label, 
    kills, 
    cost_adjustment, 
    fighter_class,
    xp_to_add, 
    operation, 
    note, 
    killed,
    retired,
    enslaved,
    starved 
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
          total_xp: newTotalXp
        })
        .eq('id', params.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return NextResponse.json(updatedFighter);
    }

    // If updating fighter status (killed, retired, enslaved, starved)
    if (killed !== undefined || retired !== undefined || enslaved !== undefined || starved !== undefined) {
      const updateData: Record<string, boolean> = {};
      
      if (killed !== undefined) updateData.killed = killed;
      if (retired !== undefined) updateData.retired = retired;
      if (enslaved !== undefined) updateData.enslaved = enslaved;
      if (starved !== undefined) updateData.starved = starved;

      const { data: updatedFighter, error: statusUpdateError } = await supabase
        .from("fighters")
        .update(updateData)
        .eq('id', params.id)
        .select()
        .single();

      if (statusUpdateError) throw statusUpdateError;
      return NextResponse.json(updatedFighter);
    }

    // If updating fighter name/label/kills/cost_adjustment/note/fighter_class
    if (fighter_name !== undefined || label !== undefined || kills !== undefined || 
        cost_adjustment !== undefined || note !== undefined || fighter_class !== undefined) {
      const { data: updatedFighter, error: fighterUpdateError } = await supabase
        .from("fighters")
        .update({ 
          fighter_name,
          label,
          kills: kills !== undefined ? kills : undefined,
          cost_adjustment: cost_adjustment !== undefined ? cost_adjustment : undefined,
          note: note !== undefined ? note : undefined,
          fighter_class: fighter_class !== undefined ? fighter_class : undefined
        })
        .eq('id', params.id)
        .select()
        .single();

      if (fighterUpdateError) throw fighterUpdateError;
      return NextResponse.json(updatedFighter);
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
