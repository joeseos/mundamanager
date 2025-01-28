import { createClient } from "@/utils/supabase/server";
import { createMockClient } from "@/utils/supabase/mock-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // const supabase = createClient();
  const supabase = createMockClient();
  try {
    const { fighter_equipment_id, new_equipment_id } = await request.json();

    if (!fighter_equipment_id || !new_equipment_id) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const { data: currentEquipment, error: currentEquipError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        fighter_id,
        equipment:equipment_id (
          id,
          equipment_name,
          cost
        )
      `)
      .eq('id', fighter_equipment_id)
      .single(); // AI generated query you might want to change this to actually resemble the other queries.

    if (currentEquipError) throw currentEquipError;
    if (!currentEquipment) {
      return NextResponse.json({ error: "Current equipment not found" }, { status: 404 });
    }

    const { data: newEquipment, error: newEquipError } = await supabase
      .from('equipment')
      .select('id, equipment_name, cost')
      .eq('id', new_equipment_id)
      .single();

    if (newEquipError) throw newEquipError;
    if (!newEquipment) {
      return NextResponse.json({ error: "New equipment not found" }, { status: 404 });
    }

    const costDifference = newEquipment.cost - currentEquipment.equipment.cost;

    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('credits')
      .eq('id', currentEquipment.fighter_id)
      .single();

    if (fighterError) throw fighterError;


    if (fighter.credits < costDifference) {
      return NextResponse.json({ error: "Insufficient credits for upgrade" }, { status: 400 });
    }

    const { data: updatedEquipment, error: updateError } = await supabase.rpc(
      'upgrade_fighter_equipment',
      {
        p_fighter_equipment_id: fighter_equipment_id,
        p_new_equipment_id: new_equipment_id,
        p_cost_difference: costDifference
      }
    );

    if (updateError) throw updateError;

    const { data: equipmentWithDetails, error: detailsError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        fighter_id,
        equipment:equipment_id (
          id,
          equipment_name,
          equipment_type,
          cost,
          weapon_profiles
        )
      `)
      .eq('id', fighter_equipment_id)
      .single();

    if (detailsError) throw detailsError;

    return NextResponse.json({
      message: "Equipment upgraded successfully",
      upgraded_equipment: {
        fighter_equipment_id: equipmentWithDetails.id,
        equipment_id: equipmentWithDetails.equipment.id,
        equipment_name: equipmentWithDetails.equipment.equipment_name,
        equipment_type: equipmentWithDetails.equipment.equipment_type,
        cost: equipmentWithDetails.equipment.cost,
        weapon_profiles: equipmentWithDetails.equipment.weapon_profiles
      }
    });

  } catch (error) {
    console.error('Error upgrading equipment:', error);
    return NextResponse.json(
      { error: 'Failed to upgrade equipment' },
      { status: 500 }
    );
  }
} 