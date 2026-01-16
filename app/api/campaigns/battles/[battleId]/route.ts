import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

// PUT endpoint to update an existing battle log
export async function PUT(
  request: Request,
  props: { params: Promise<{ battleId: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const battleId = params.battleId;
  const campaignId = request.headers.get('X-Campaign-Id');

  if (!campaignId) {
    return NextResponse.json(
      { error: 'Campaign ID is required' },
      { status: 400 }
    );
  }

  if (!battleId) {
    return NextResponse.json(
      { error: 'Battle ID is required' },
      { status: 400 }
    );
  }

  try {
    const requestBody = await request.json();
    const {
      scenario,
      attacker_id,
      defender_id,
      winner_id,
      note,
      participants,
      claimed_territories = [],
      cycle
    } = requestBody;

    // Validate required fields
    if (!scenario || !attacker_id || !defender_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // First, verify the battle exists and belongs to the campaign
    const { data: existingBattle, error: checkError } = await supabase
      .from('campaign_battles')
      .select('id')
      .eq('id', battleId)
      .eq('campaign_id', campaignId)
      .single();

    if (checkError || !existingBattle) {
      return NextResponse.json(
        { error: 'Battle not found or access denied' },
        { status: 404 }
      );
    }

    // Update the battle record
    const { data: battle, error: battleError } = await supabase
      .from('campaign_battles')
      .update({
        scenario,
        attacker_id,
        defender_id,
        winner_id,
        note,
        participants: Array.isArray(participants) ? JSON.stringify(participants) : participants,
        updated_at: new Date().toISOString(),
        cycle
      })
      .eq('id', battleId)
      .select()
      .single();

    if (battleError) throw battleError;

    // Process territory claims if any
    if (claimed_territories.length > 0 && winner_id) {
      for (const territory of claimed_territories) {
        await supabase
          .from('campaign_territories')
          .update({ controlled_by: winner_id })
          .eq('territory_id', territory.territory_id)
          .eq('campaign_id', campaignId);
      }
    }

    // Then fetch the related data for display
    const [
      { data: attacker },
      { data: defender },
      { data: winner }
    ] = await Promise.all([
      supabase.from('gangs').select('name').eq('id', attacker_id).maybeSingle(),
      supabase.from('gangs').select('name').eq('id', defender_id).maybeSingle(),
      winner_id ? supabase.from('gangs').select('name').eq('id', winner_id).maybeSingle() : Promise.resolve({ data: null })
    ]);

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      cycle: battle.cycle,
      attacker: { gang_name: attacker?.name },
      defender: { gang_name: defender?.name },
      winner: winner?.name ? { gang_name: winner.name } : null
    };

    return NextResponse.json(transformedBattle);

  } catch (error) {
    console.error('Error updating battle:', error);
    return NextResponse.json(
      { error: 'Failed to update battle' },
      { status: 500 }
    );
  }
}

// DELETE endpoint to remove a battle log
export async function DELETE(
  request: Request,
  props: { params: Promise<{ battleId: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const battleId = params.battleId;
  const campaignId = request.headers.get('X-Campaign-Id');

  if (!campaignId) {
    return NextResponse.json(
      { error: 'Campaign ID is required' },
      { status: 400 }
    );
  }

  if (!battleId) {
    return NextResponse.json(
      { error: 'Battle ID is required' },
      { status: 400 }
    );
  }

  try {
    // First, verify the battle exists and belongs to the campaign
    const { data: existingBattle, error: checkError } = await supabase
      .from('campaign_battles')
      .select('id')
      .eq('id', battleId)
      .eq('campaign_id', campaignId)
      .single();

    if (checkError || !existingBattle) {
      return NextResponse.json(
        { error: 'Battle not found or access denied' },
        { status: 404 }
      );
    }

    // Delete the battle
    const { error: deleteError } = await supabase
      .from('campaign_battles')
      .delete()
      .eq('id', battleId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting battle:', error);
    return NextResponse.json(
      { error: 'Failed to delete battle' },
      { status: 500 }
    );
  }
} 