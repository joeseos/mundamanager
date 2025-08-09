import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from 'next/cache';

// Invalidate equipment cache when trading posts change
function invalidateEquipmentCache() {
  revalidateTag('equipment-data');
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get('equipment_id');

  if (!equipmentId) {
    return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 });
  }

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('trading_post_equipment')
      .select(`
        trading_post_type_id,
        trading_post_types!inner(
          id,
          trading_post_name
        )
      `)
      .eq('equipment_id', equipmentId);

    if (error) throw error;

    // Extract just the trading post type IDs
    const tradingPostIds = data.map(item => item.trading_post_type_id);
    
    return NextResponse.json(tradingPostIds);
  } catch (error) {
    console.error('Error fetching equipment trading posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch equipment trading posts' },
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

    const { equipment_id, trading_post_ids } = await request.json();

    if (!equipment_id) {
      return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 });
    }

    // First, delete existing associations for this equipment
    const { error: deleteError } = await supabase
      .from('trading_post_equipment')
      .delete()
      .eq('equipment_id', equipment_id);

    if (deleteError) throw deleteError;

    // Then, insert new associations if any are provided
    if (trading_post_ids && trading_post_ids.length > 0) {
      const associations = trading_post_ids.map((trading_post_type_id: string) => ({
        equipment_id,
        trading_post_type_id
      }));

      const { error: insertError } = await supabase
        .from('trading_post_equipment')
        .insert(associations);

      if (insertError) throw insertError;
    }

    // Invalidate equipment cache after successful trading post update
    invalidateEquipmentCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating equipment trading posts:', error);
    return NextResponse.json(
      { error: 'Failed to update equipment trading posts' },
      { status: 500 }
    );
  }
} 