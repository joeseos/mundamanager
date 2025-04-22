import { createClient } from "@/utils/supabase/server";
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  try {
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

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const url = new URL(request.url);
  const effectId = url.searchParams.get('effectId');

  if (!effectId) {
    return NextResponse.json(
      { error: 'Effect ID is required' },
      { status: 400 }
    );
  }

  try {
    const { error: deleteError } = await supabase
      .from('fighter_effects')
      .delete()
      .eq('id', effectId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ message: 'Injury deleted successfully' });
  } catch (error) {
    console.error('Error deleting injury:', error);
    return NextResponse.json(
      { error: 'Failed to delete injury' },
      { status: 500 }
    );
  }
}