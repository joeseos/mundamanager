import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { normaliseParticipants, territoryClaimerFor } from "@/utils/battle-participants";

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

