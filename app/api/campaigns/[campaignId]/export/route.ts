import { NextResponse } from "next/server";
import {
  getCampaignBasic,
  getCampaignMembers,
  getCampaignTerritories,
  getCampaignBattles
} from "@/app/lib/campaigns/[id]/get-campaign-data";

// Helper function to convert object to XML
function objectToXml(obj: any, rootName: string = 'root'): string {
  function buildXml(data: any, nodeName: string): string {
    if (data === null || data === undefined) {
      return `<${nodeName} />`;
    }
    
    if (typeof data !== 'object') {
      // Escape special XML characters
      const escaped = String(data)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      return `<${nodeName}>${escaped}</${nodeName}>`;
    }
    
    if (Array.isArray(data)) {
      return data.map(item => buildXml(item, nodeName.replace(/s$/, ''))).join('');
    }
    
    const children = Object.entries(data)
      .map(([key, value]) => buildXml(value, key))
      .join('');
    
    return `<${nodeName}>${children}</${nodeName}>`;
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(obj, rootName)}`;
}

export async function GET(request: Request, props: { params: Promise<{ campaignId: string }> }) {
  const params = await props.params;
  const { campaignId } = params;
  
  // Get format from query parameter (e.g., ?format=xml)
  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'json';

  if (!campaignId) {
    return format === 'xml'
      ? new NextResponse(objectToXml({ error: "Campaign ID is required" }, 'error'), {
          status: 400,
          headers: { 'Content-Type': 'application/xml' }
        })
      : NextResponse.json(
          { error: "Campaign ID is required" },
          { status: 400 }
        );
  }

  try {
    // Fetch all campaign data using existing cached functions
    // Access control is handled by Supabase RLS policies
    const [
      campaignBasic,
      campaignMembers,
      campaignTerritories,
      campaignBattles
    ] = await Promise.all([
      getCampaignBasic(campaignId),
      getCampaignMembers(campaignId),
      getCampaignTerritories(campaignId),
      getCampaignBattles(campaignId)
    ]);

    // Return 404 if campaign not found
    if (!campaignBasic) {
      return format === 'xml'
        ? new NextResponse(objectToXml({ error: 'Campaign not found' }, 'error'), {
            status: 404,
            headers: { 'Content-Type': 'application/xml' }
          })
        : NextResponse.json(
            { error: 'Campaign not found' },
            { status: 404 }
          );
    }

    // Transform members data to include territories under their gangs
    // Note: We exclude auth user IDs for privacy, only include campaign-scoped IDs
    const membersWithTerritories = campaignMembers.map(member => {
      const gangsWithTerritories = member.gangs.map(gang => {
        // Find territories owned by this gang
        const gangTerritories = campaignTerritories.filter(
          territory => territory.gang_id === gang.gang_id
        );

        return {
          ...gang,
          territories: gangTerritories
        };
      });

      return {
        user_info: {
          campaign_member_id: member.id,
          username: member.username,
          role: member.role,
          status: member.status,
          invited_at: member.invited_at,
          joined_at: member.joined_at
        },
        gangs: gangsWithTerritories
      };
    });

    // Build the export structure
    const exportData = {
      campaign: {
        id: campaignBasic.id,
        campaign_name: campaignBasic.campaign_name,
        campaign_type_id: campaignBasic.campaign_type_id,
        campaign_type_name: (campaignBasic.campaign_types as any)?.campaign_type_name || '',
        campaign_type_image_url: (campaignBasic.campaign_types as any)?.image_url || '',
        image_url: campaignBasic.image_url || '',
        status: campaignBasic.status,
        description: campaignBasic.description,
        created_at: campaignBasic.created_at,
        updated_at: campaignBasic.updated_at,
        note: campaignBasic.note,
        has_meat: campaignBasic.has_meat,
        has_exploration_points: campaignBasic.has_exploration_points,
        has_scavenging_rolls: campaignBasic.has_scavenging_rolls
      },
      members: membersWithTerritories,
      available_territories: campaignTerritories,
      battle_logs: campaignBattles
    };

    // Return based on requested format
    if (format === 'xml') {
      const xmlContent = objectToXml(exportData, 'campaign_export');
      return new NextResponse(xmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `inline; filename="campaign_${campaignId}.xml"`
        }
      });
    }

    return NextResponse.json(exportData);
  } catch (error) {
    console.error('Error exporting campaign:', error);
    return format === 'xml'
      ? new NextResponse(objectToXml({ error: "Failed to export campaign data" }, 'error'), {
          status: 500,
          headers: { 'Content-Type': 'application/xml' }
        })
      : NextResponse.json(
          { error: "Failed to export campaign data" },
          { status: 500 }
        );
  }
}
