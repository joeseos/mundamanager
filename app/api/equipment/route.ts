import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET() {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch regular equipment and user's custom equipment in parallel
    const [regularEquipmentResult, customEquipmentResult] = await Promise.all([
      supabase
        .from('equipment')
        .select('id, equipment_name, equipment_category')
        .order('equipment_name'),
      supabase
        .from('custom_equipment')
        .select('id, equipment_name, equipment_category')
        .eq('user_id', userId)
        .order('equipment_name')
    ]);

    if (regularEquipmentResult.error) throw regularEquipmentResult.error;
    if (customEquipmentResult.error) throw customEquipmentResult.error;

    // Transform custom equipment to match the expected format and mark them as custom
    const regularEquipment = (regularEquipmentResult.data || []).map(item => ({
      id: item.id,
      equipment_name: item.equipment_name,
      equipment_category: item.equipment_category,
      is_custom: false,
      equipment_type: 'regular'
    }));

    const customEquipment = (customEquipmentResult.data || []).map(item => ({
      id: `custom_${item.id}`, // Prefix custom equipment IDs for easy identification
      equipment_name: `${item.equipment_name} (Custom)`, // Mark as custom in display
      equipment_category: item.equipment_category,
      is_custom: true,
      equipment_type: 'custom',
      original_id: item.id // Keep the original ID for database operations
    }));

    // Combine and sort all equipment by name
    const allEquipment = [...regularEquipment, ...customEquipment]
      .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name));

    return NextResponse.json(allEquipment);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch equipment' },
      { status: 500 }
    );
  }
}