import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { cookies } from 'next/headers';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const url = new URL(request.url);
  const injuryId = url.searchParams.get('injuryId');

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
  const { fighter_name, label, kills, cost_adjustment, xp_to_add, operation, note } = body;

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

    // If updating fighter name/label/kills/cost_adjustment/note
    if (fighter_name !== undefined || label !== undefined || kills !== undefined || 
        cost_adjustment !== undefined || note !== undefined) {
      const { data: updatedFighter, error: fighterUpdateError } = await supabase
        .from("fighters")
        .update({ 
          fighter_name,
          label,
          kills: kills !== undefined ? kills : undefined,
          cost_adjustment: cost_adjustment !== undefined ? cost_adjustment : undefined,
          note: note !== undefined ? note : undefined
        })
        .eq('id', params.id)
        .select()
        .single();

      if (fighterUpdateError) throw fighterUpdateError;
      return NextResponse.json(updatedFighter);
    }

    return NextResponse.json({ error: "No valid update parameters provided" }, { status: 400 });
  } catch (error) {
    console.error('Error updating fighter:', error);
    return NextResponse.json(
      { error: 'Failed to update fighter' },
      { status: 500 }
    );
  }
}
