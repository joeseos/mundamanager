import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request
) {
  const supabase = await createClient();
  const campaignId = request.headers.get('X-Campaign-Id');

  if (!campaignId) {
    return NextResponse.json(
      { error: 'Campaign ID is required' },
      { status: 400 }
    );
  }

  try {
    // Get scenarios
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, scenario_name, scenario_number');

    if (scenariosError) throw scenariosError;

    // Get gangs in the campaign with their names
    const { data: campaignGangs, error: gangsError } = await supabase
      .from('campaign_gangs')
      .select(`gang_id, gangs:gang_id ( id, name )`)
      .eq('campaign_id', campaignId);

    if (gangsError) throw gangsError;

    // Transform the data for easier consumption
    const gangs = campaignGangs
      .filter(cg => cg.gangs && cg.gangs.length > 0) // Ensure gangs array is not empty
      .map(cg => ({
        id: cg.gang_id,
        name: cg.gangs[0].name // Access the first gang's name
      }));

    return NextResponse.json({
      scenarios,
      gangs
    });

  } catch (error) {
    console.error('Error fetching battle data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch battle data' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request
) {
  const supabase = await createClient();
  const campaignId = request.headers.get('X-Campaign-Id');

  if (!campaignId) {
    return NextResponse.json(
      { error: 'Campaign ID is required' },
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
      claimed_territories = [] 
    } = requestBody;

    // Validate required fields
    if (!scenario || !attacker_id || !defender_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // First, create the battle record
    const { data: battle, error: battleError } = await supabase
      .from('campaign_battles')
      .insert([
        {
          campaign_id: campaignId,
          scenario,
          attacker_id,
          defender_id,
          winner_id,
          note,
          participants: Array.isArray(participants) ? JSON.stringify(participants) : participants,
          created_at: new Date().toISOString()
        }
      ])
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
      supabase.from('gangs').select('name').eq('id', attacker_id).single(),
      supabase.from('gangs').select('name').eq('id', defender_id).single(),
      winner_id ? supabase.from('gangs').select('name').eq('id', winner_id).single() : Promise.resolve({ data: null })
    ]);

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      attacker: { gang_name: attacker?.name },
      defender: { gang_name: defender?.name },
      winner: winner?.name ? { gang_name: winner.name } : null
    };

    return NextResponse.json(transformedBattle);

  } catch (error) {
    console.error('Error creating battle:', error);
    return NextResponse.json(
      { error: 'Failed to create battle' },
      { status: 500 }
    );
  }
}