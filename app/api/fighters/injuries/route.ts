import { createClient } from "@/utils/supabase/server";
import { data } from "autoprefixer";
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createClient();
  console.log("hello")
  try {
    console.log("route in injuries")

    // First fetch the fighter effects
    const { data: effects, error: effectsError } = await supabase
    .from('fighter_effect_types')
    .select(`
      *,
      fighter_effect_categories!inner(*),
      fighter_effect_type_modifiers (
          *
      )
   `)
    .eq('fighter_effect_categories.category_name', 'injuries'); 
    if (effectsError) throw effectsError;
    return NextResponse.json(effects || []);
    } catch (error) {
    console.error('Error fetching injuries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch injuries' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const url = new URL(request.url);
  const injuryId = url.searchParams.get('effectId');

  try {
    if (injuryId) {
      // Delete specific injury
      const { error: deleteError } = await supabase
        .from('fighter_effects')
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