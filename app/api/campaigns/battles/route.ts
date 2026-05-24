import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { normaliseParticipants, territoryClaimerFor } from "@/app/actions/campaigns/[id]/battle-logs";

export async function GET(
  request: Request
) {
  const supabase = await createClient();
  const campaignId = request.headers.get('X-Campaign-Id');

  try {
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, scenario_name, scenario_number');

    if (scenariosError) throw scenariosError;

    if (!campaignId) {
      return NextResponse.json({ scenarios });
    }

    const { data: campaignGangs, error: gangsError } = await supabase
      .from('campaign_gangs')
      .select(`gang_id, gangs:gang_id ( id, name )`)
      .eq('campaign_id', campaignId);

    if (gangsError) throw gangsError;

    const gangs = campaignGangs
      .filter(cg => cg.gangs && cg.gangs.length > 0)
      .map(cg => ({
        id: cg.gang_id,
        name: cg.gangs[0].name
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
      winner_id: callerWinnerId = null,
      note,
      participants: rawParticipants,
      claimed_territories = [],
      territory_claimed_by_gang_id = null,
      cycle,
    } = requestBody;

    // Validate required fields
    if (!scenario || !rawParticipants || !Array.isArray(rawParticipants) || rawParticipants.length < 2) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Normalise the participants array using the shared helper so this path and
    // the server action can never drift.
    const newTerritoryId = claimed_territories.length > 0
      ? claimed_territories[0].campaign_territory_id ?? null
      : null;
    const existingClaimer = (rawParticipants as any[]).find(
      (p) => p.claimed_territory === true
    )?.gang_id ?? null;
    const { participants: normalisedParticipants, effectiveWinnerIds, claimerGangId } =
      normaliseParticipants(
        rawParticipants,
        callerWinnerId,
        territoryClaimerFor(newTerritoryId, territory_claimed_by_gang_id, existingClaimer)
      );

    const legacyWinnerId: string | null = claimerGangId ?? effectiveWinnerIds[0] ?? null;

    // First, create the battle record
    const { data: battle, error: battleError } = await supabase
      .from('campaign_battles')
      .insert([
        {
          campaign_id: campaignId,
          scenario,
          winner_id: legacyWinnerId,
          note,
          participants: JSON.stringify(normalisedParticipants),
          created_at: new Date().toISOString(),
          cycle,
        },
      ])
      .select()
      .single();

    if (battleError) throw battleError;

    // Process territory claims for the chosen claimer (if any)
    if (claimed_territories.length > 0 && claimerGangId) {
      for (const territory of claimed_territories) {
        await supabase
          .from('campaign_territories')
          .update({ controlled_by: claimerGangId })
          .eq('territory_id', territory.territory_id)
          .eq('campaign_id', campaignId);
      }
    }

    // Derive attacker/defender from participants for enrichment
    const attacker_id = normalisedParticipants.find((p: any) => p.role === 'attacker')?.gang_id;
    const defender_id = normalisedParticipants.find((p: any) => p.role === 'defender')?.gang_id;

    // Then fetch the related data for display
    const [
      { data: attacker },
      { data: defender },
      { data: winner },
    ] = await Promise.all([
      attacker_id ? supabase.from('gangs').select('name').eq('id', attacker_id).maybeSingle() : Promise.resolve({ data: null }),
      defender_id ? supabase.from('gangs').select('name').eq('id', defender_id).maybeSingle() : Promise.resolve({ data: null }),
      legacyWinnerId ? supabase.from('gangs').select('name').eq('id', legacyWinnerId).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      cycle: battle.cycle,
      attacker: attacker?.name ? { gang_name: attacker.name } : undefined,
      defender: defender?.name ? { gang_name: defender.name } : undefined,
      winner: winner?.name ? { gang_name: winner.name } : null,
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