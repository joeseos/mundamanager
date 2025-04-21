import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const fighterWeaponId = params.id;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const { fighterId, equipmentId } = await request.json();

  try {
    // Get the fighter_weapon entry
    const { data: fighterWeapon, error: fetchError } = await supabase
      .from('fighter_weapons')
      .select('*')
      .eq('id', fighterWeaponId)
      .single();

    if (fetchError) throw fetchError;

    // Get the weapon details
    const { data: weapon, error: weaponError } = await supabase
      .from('weapons')
      .select('*')
      .eq('id', equipmentId)
      .single();

    if (weaponError) throw weaponError;

    // Get the fighter details
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('*')
      .eq('id', fighterId)
      .single();

    if (fighterError) throw fighterError;

    // Delete the fighter_weapon entry
    const { error: deleteError } = await supabase
      .from('fighter_weapons')
      .delete()
      .eq('id', fighterWeaponId);

    if (deleteError) throw deleteError;

    // Calculate new credits
    const newFighterCredits = fighter.credits + (action === 'sell' ? weapon.cost : 0);

    // Update fighter credits
    const { data: updatedFighter, error: updateFighterError } = await supabase
      .from('fighters')
      .update({ credits: newFighterCredits })
      .eq('id', fighterId)
      .select('credits')
      .single();

    if (updateFighterError) throw updateFighterError;

    let gangCredits = 0;
    if (action === 'sell') {
      // Get current gang credits
      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('credits')
        .eq('id', fighter.gang_id)
        .single();

      if (gangError) throw gangError;

      // Update gang credits
      const { data: updatedGang, error: updateGangError } = await supabase
        .from('gangs')
        .update({ credits: gang.credits + weapon.cost })
        .eq('id', fighter.gang_id)
        .select('credits')
        .single();

      if (updateGangError) throw updateGangError;

      gangCredits = updatedGang.credits;
    }

    return NextResponse.json({ 
      message: action === 'sell' ? "Equipment sold and credits updated successfully" : "Equipment deleted successfully", 
      credits: updatedFighter.credits,
      gangCredits
    }, { status: 200 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
