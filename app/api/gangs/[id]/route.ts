import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

enum GangAlignment {
  LAW_ABIDING = 'Law Abiding',
  OUTLAW = 'Outlaw'
}

// Simplified Territory interface to match what we're actually using
interface Territory {
  id: string;
  territory_name: string;
  campaign_id?: string;
  campaign_name?: string;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  try {
    // Get gang data with campaigns
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select(`
        *,
        campaigns:campaign_gangs(campaign_id, campaign:campaigns(id, campaign_name))
      `)
      .eq('id', params.id)
      .single();

    if (gangError) throw gangError;

    // Extract campaign IDs from the gang data
    const campaignIds = gangData?.campaigns?.map((c: any) => c.campaign_id) || [];
    
    // Fetch territories where this gang is the controller and in the campaigns this gang is part of
    let territories: Territory[] = [];
    
    if (campaignIds.length > 0) {
      const { data: territoryData, error: territoryError } = await supabase
        .from('campaign_territories')
        .select(`
          id, 
          territory_name,
          campaign_id
        `)
        .in('campaign_id', campaignIds)
        .eq('gang_id', params.id);

      if (territoryError) throw territoryError;
      
      // Process territories with basic information (no need for join that was causing errors)
      territories = territoryData || [];
      
      // If we need campaign names, we could do a separate query to get them
      if (territories.length > 0 && campaignIds.length > 0) {
        const { data: campaignData, error: campaignError } = await supabase
          .from('campaigns')
          .select('id, campaign_name')
          .in('id', campaignIds);
          
        if (!campaignError && campaignData) {
          // Create a map of campaign_id to campaign_name for efficient lookup
          const campaignMap = campaignData.reduce((map: {[key: string]: string}, camp: any) => {
            map[camp.id] = camp.campaign_name;
            return map;
          }, {});
          
          // Add campaign names to the territories
          territories = territories.map(territory => ({
            ...territory,
            campaign_name: campaignMap[territory.campaign_id || ''] || 'Unknown Campaign'
          }));
        }
      }
    }
    
    // No need for fallback query since we're now using the correct table

    return NextResponse.json({ 
      territories,
      gang: gangData 
    });

  } catch (error) {
    console.error('Error fetching gang data:', error);
    return NextResponse.json(
      { error: "Failed to fetch gang data" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { 
    name,
    credits, 
    operation, 
    alignment,
    alliance_id,
    reputation,
    meat,
    exploration_points,
    note,
    vehicleId,
    vehicle_name
  } = await request.json();

  try {
    // Get the current user using server-side auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // For vehicle name updates
    if (operation === 'update_vehicle_name') {
      // RLS will handle gang ownership and vehicle-to-gang relationship checks
      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ vehicle_name })
        .eq('id', vehicleId)
        .eq('gang_id', params.id);

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update vehicle name' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    // Prepare update object
    const updates: any = {
      last_updated: new Date().toISOString()
    };

    // Add name if provided
    if (name !== undefined) {
      updates.name = name;
    }

    // Add note if provided
    if (note !== undefined) {
      updates.note = note;
    }

    // Add alignment if provided
    if (alignment !== undefined) {
      if (!['Law Abiding', 'Outlaw'].includes(alignment)) {
        return NextResponse.json(
          { error: "Invalid alignment value. Must be 'Law Abiding' or 'Outlaw'" }, 
          { status: 400 }
        );
      }
      updates.alignment = alignment;
    }

    // Add alliance_id if provided
    if (alliance_id !== undefined) {
      updates.alliance_id = alliance_id;
    }

    // Add reputation if provided
    if (reputation !== undefined) {
      updates.reputation = reputation;
    }

    // Add meat if provided
    if (meat !== undefined) {
      updates.meat = meat;
    }

    // Add exploration points if provided
    if (exploration_points !== undefined) {
      updates.exploration_points = exploration_points;
    }

    // Add credits if provided
    if (credits !== undefined && operation) {
      const { data: currentGang, error: gangFetchError } = await supabase
        .from("gangs")
        .select('credits')
        .eq('id', params.id)
        .single();

      if (gangFetchError) throw gangFetchError;

      updates.credits = operation === 'add' 
        ? (currentGang.credits || 0) + credits
        : (currentGang.credits || 0) - credits;
    }

    // Perform the update
    const { data: updatedGang, error: gangUpdateError } = await supabase
      .from("gangs")
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (gangUpdateError) throw gangUpdateError;

    return NextResponse.json(updatedGang);
  } catch (error) {
    console.error("Error updating gang:", error);
    return NextResponse.json({ error: "Failed to update gang" }, { status: 500 });
  }
}
