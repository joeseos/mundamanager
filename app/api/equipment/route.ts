import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";
import { editionSlugFromJoin, EditionJoin } from "@/types/edition";
import { fetchAllRows } from "@/utils/supabase/fetch-all-rows";

interface RegularEquipmentRow {
  id: string;
  equipment_name: string;
  equipment_category: string;
  equipment_type: string;
  core_equipment: boolean | null;
  editions: EditionJoin;
}

interface CustomEquipmentRow {
  id: string;
  equipment_name: string;
  equipment_category: string;
  equipment_type: string;
  editions: EditionJoin;
}

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

    // Fetch regular equipment and user's custom equipment in parallel, paging
    // past PostgREST's default max-rows cap so large catalogs aren't silently
    // truncated (see utils/supabase/fetch-all-rows.ts).
    const [regularEquipmentRows, customEquipmentRows] = await Promise.all([
      fetchAllRows<RegularEquipmentRow>((from, to) => {
        let query = supabase
          .from('equipment')
          .select('id, equipment_name, equipment_category, equipment_type, core_equipment, editions:edition_id (slug)')
          .order('equipment_name')
          .order('id')
          .range(from, to);

        if (equipmentType) {
          query = query.eq('equipment_type', equipmentType);
        }
        if (coreEquipment === 'false') {
          query = query.or('core_equipment.is.null,core_equipment.eq.false');
        }

        return query;
      }),
      fetchAllRows<CustomEquipmentRow>((from, to) => {
        let query = supabase
          .from('custom_equipment')
          .select('id, equipment_name, equipment_category, equipment_type, editions:edition_id (slug)')
          .eq('user_id', userId)
          .order('equipment_name')
          .order('id')
          .range(from, to);

        if (equipmentType) {
          query = query.eq('equipment_type', equipmentType);
        }

        return query;
      }),
    ]);

    // Transform custom equipment to match the expected format and mark them as custom.
    // Both branches carry edition_slug so callers can scope pickers to one edition.
    const regularEquipment = regularEquipmentRows.map(item => ({
      id: item.id,
      equipment_name: item.equipment_name,
      equipment_category: item.equipment_category,
      equipment_type: item.equipment_type,
      edition_slug: editionSlugFromJoin(item.editions),
      is_custom: false,
    }));

    const customEquipment = customEquipmentRows.map(item => ({
      id: `custom_${item.id}`,
      equipment_name: `${item.equipment_name} (Custom)`,
      equipment_category: item.equipment_category,
      equipment_type: item.equipment_type,
      edition_slug: editionSlugFromJoin(item.editions),
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