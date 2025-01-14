import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request
) {
  const supabase = createClient();
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
      .select('id, scenario_name');

    if (scenariosError) throw scenariosError;

    // Get gangs in the campaign with their names
    const { data: campaignGangs, error: gangsError } = await supabase
      .from('campaign_gangs')
      .select(`
        gang_id,
        gang:gang_id (
          id,
          name
        )
      `)
      .eq('campaign_id', campaignId);

    if (gangsError) throw gangsError;

    // Transform the data for easier consumption
    const gangs = campaignGangs
      .filter(cg => cg.gang)
      .map(cg => ({
        id: cg.gang_id,
        name: cg.gang.name
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
  const supabase = createClient();
  const campaignId = request.headers.get('X-Campaign-Id');

  if (!campaignId) {
    return NextResponse.json(
      { error: 'Campaign ID is required' },
      { status: 400 }
    );
  }

  try {
    const { scenario_id, attacker_id, defender_id, winner_id } = await request.json();

    // Validate required fields
    if (!scenario_id || !attacker_id || !defender_id || !winner_id) {
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
          scenario_id,
          attacker_id,
          defender_id,
          winner_id,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (battleError) throw battleError;

    // Then fetch the related data
    const [
      { data: scenario },
      { data: attacker },
      { data: defender },
      { data: winner }
    ] = await Promise.all([
      supabase.from('scenarios').select('scenario_name').eq('id', scenario_id).single(),
      supabase.from('gangs').select('name').eq('id', attacker_id).single(),
      supabase.from('gangs').select('name').eq('id', defender_id).single(),
      supabase.from('gangs').select('name').eq('id', winner_id).single()
    ]);

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      scenario_name: scenario?.scenario_name,
      attacker: { gang_name: attacker?.name },
      defender: { gang_name: defender?.name },
      winner: { gang_name: winner?.name }
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