import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const equipmentType = searchParams.get('equipment_type');
    const coreEquipment = searchParams.get('core_equipment');

    // Fetch regular equipment and user's custom equipment in parallel
    let regularQuery = supabase
      .from('equipment')
      .select('id, equipment_name, equipment_category, equipment_type, core_equipment')
      .order('equipment_name');

    let customQuery = supabase
      .from('custom_equipment')
      .select('id, equipment_name, equipment_category, equipment_type')
      .eq('user_id', userId)
      .order('equipment_name');

    if (equipmentType) {
      regularQuery = regularQuery.eq('equipment_type', equipmentType);
      customQuery = customQuery.eq('equipment_type', equipmentType);
    }

    if (coreEquipment === 'false') {
      regularQuery = regularQuery.or('core_equipment.is.null,core_equipment.eq.false');
    }

    const [regularEquipmentResult, customEquipmentResult] = await Promise.all([
      regularQuery,
      customQuery,
    ]);

    if (regularEquipmentResult.error) throw regularEquipmentResult.error;
    if (customEquipmentResult.error) throw customEquipmentResult.error;

    // Transform custom equipment to match the expected format and mark them as custom
    const regularEquipment = (regularEquipmentResult.data || []).map(item => ({
      id: item.id,
      equipment_name: item.equipment_name,
      equipment_category: item.equipment_category,
      equipment_type: item.equipment_type,
      is_custom: false,
    }));

    const customEquipment = (customEquipmentResult.data || []).map(item => ({
      id: `custom_${item.id}`,
      equipment_name: `${item.equipment_name} (Custom)`,
      equipment_category: item.equipment_category,
      equipment_type: item.equipment_type,
      is_custom: true,
      original_id: item.id,
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