import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/server";
import {
  getCampaignBasic,
  getCampaignMembers,
  getCampaignTerritories,
  getCampaignBattles
} from "@/app/lib/campaigns/[id]/get-campaign-data";

// IP-based rate limiting storage
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const exportRateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Extract client IP from Vercel request headers
 * Vercel sets x-forwarded-for with the true client IP
 */
function getClientIP(request: Request): string {
  // Primary: x-forwarded-for (set by Vercel)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Can be comma-separated list, take first IP
    return forwarded.split(',')[0].trim();
  }

  // Fallback: x-real-ip
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;

  // Development fallback
  return "127.0.0.1";
}

/**
 * Check rate limiting for export endpoint (10 requests per minute per IP)
 * @param ip - Client IP address
 * @returns Rate limit status with details for response headers
 */
function checkExportRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  reset: number;
  limit: number;
} {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 10;

  const entry = exportRateLimitMap.get(ip);

  // Create new window if doesn't exist or expired
  if (!entry || now > entry.resetTime) {
    exportRateLimitMap.set(ip, {
      count: 1,
      resetTime: now + windowMs
    });

    // Cleanup expired entries (memory leak prevention)
    const expirationThreshold = now - windowMs;
    const entries = Array.from(exportRateLimitMap.entries());
    for (const [key, value] of entries) {
      if (value.resetTime < expirationThreshold) {
        exportRateLimitMap.delete(key);
      }
    }

    return {
      allowed: true,
      remaining: maxRequests - 1,
      reset: now + windowMs,
      limit: maxRequests
    };
  }

  // Check if limit exceeded
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      reset: entry.resetTime,
      limit: maxRequests
    };
  }

  // Increment counter
  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    reset: entry.resetTime,
    limit: maxRequests
  };
}


// Helper function to convert object to XML
function objectToXml(obj: any, rootName: string = 'root'): string {
  function buildXml(data: any, nodeName: string): string {
    if (data === null || data === undefined) {
      return ''; // Return empty string to omit undefined/null fields
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
      // Empty arrays return self-closing tag
      if (data.length === 0) {
        return `<${nodeName} />`; // Self-closing tag for empty arrays
      }

      // Handle plural to singular conversion for XML node names
      let singularName = nodeName;
      if (nodeName.endsWith('ies')) {
        // territories -> territory, categories -> category
        singularName = nodeName.slice(0, -3) + 'y';
      } else if (nodeName.endsWith('s')) {
        // gangs -> gang, members -> member
        singularName = nodeName.slice(0, -1);
      }

      // Wrap array items in the plural parent tag to maintain grouping
      const items = data.map(item => buildXml(item, singularName)).join('');
      return `<${nodeName}>${items}</${nodeName}>`;
    }

    const children = Object.entries(data)
      .map(([key, value]) => buildXml(value, key))
      .filter(xml => xml !== '') // Filter out empty strings from undefined/null values
      .join('');

    // If no children after filtering, return self-closing tag
    if (children === '') {
      return `<${nodeName} />`;
    }

    return `<${nodeName}>${children}</${nodeName}>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(obj, rootName)}`;
}

// TypeScript interfaces for export data structures

interface ExportGangReference {
  id: string;
  name: string;
  type: string;
  colour: string;
}

interface ExportTerritory {
  id: string;
  template_id: string | null;
  name: string;
  gang_id?: string;
  created_at: string;
  ruined: boolean;
  default_gang_territory: boolean;
  is_custom: boolean;
  owning_gangs: ExportGangReference[];
}

interface ExportGang {
  id: string;
  name: string;
  type: string;
  colour: string;
  status: string;
  rating: number;
  wealth: number;
  reputation: number;
  exploration_points: number | null;
  meat: number | null;
  scavenging_rolls: number | null;
  power: number | null;
  sustenance: number | null;
  salvage: number | null;
  territory_count: number;
  territories: ExportTerritory[];
}

interface ExportBattle {
  id: string;
  created_at: string;
  updated_at: string;
  scenario: string;
  scenario_name: string;
  scenario_number: string | null;
  note: string;
  participants: any;
  territory_id: string | null;
  territory_is_custom: boolean;
  territory_name?: string;
  attacker?: { id: string; name: string };
  defender?: { id: string; name: string };
  winner?: { id: string; name: string };
}

// Transformation functions to clean up export field names

/**
 * Transform gang data for export - maps directly from data structure
 * Data layer provides clean id/name, database names for gang_type/gang_colour
 */
function transformGangForExport(gang: any): ExportGang {
  return {
    id: gang.id, // Gang UUID
    name: gang.name,
    type: gang.gang_type,
    colour: gang.gang_colour,
    status: gang.status,
    rating: gang.rating,
    wealth: gang.wealth,
    reputation: gang.reputation,
    exploration_points: gang.exploration_points,
    meat: gang.meat,
    scavenging_rolls: gang.scavenging_rolls,
    power: gang.power,
    sustenance: gang.sustenance,
    salvage: gang.salvage,
    territory_count: gang.territory_count,
    territories: (gang.territories ?? []).map((t: any) => transformTerritoryForExport(t, true))
  };
}

/**
 * Transform territory data for export - maps directly from data structure
 * @param territory - Territory data from database
 * @param isNested - If true, omits gang_id (when nested under gang)
 */
function transformTerritoryForExport(territory: any, isNested: boolean = false): ExportTerritory {
  const result: ExportTerritory = {
    id: territory.id, // Unique campaign_territory ID
    template_id: territory.territory_id || territory.custom_territory_id,
    name: territory.territory_name,
    created_at: territory.created_at,
    ruined: territory.ruined ?? false,
    default_gang_territory: territory.default_gang_territory ?? false,
    is_custom: territory.is_custom ?? false,
    owning_gangs: (territory.owning_gangs ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      type: g.gang_type,
      colour: g.gang_colour
    }))
  };

  // Only include gang_id for top-level territories (not nested under gangs)
  if (!isNested && territory.gang_id) {
    result.gang_id = territory.gang_id;
  }

  return result;
}

/**
 * Transform battle data for export - now just maps directly from clean structure
 * Data layer already provides clean field names (no more gang_ prefixes)
 */
function transformBattleForExport(battle: any): ExportBattle {
  const transformed: ExportBattle = {
    id: battle.id,
    created_at: battle.created_at,
    updated_at: battle.updated_at,
    scenario: battle.scenario,
    scenario_name: battle.scenario_name,
    scenario_number: battle.scenario_number,
    note: battle.note,
    participants: battle.participants,
    territory_id: battle.territory_id || battle.custom_territory_id,
    territory_is_custom: !!battle.custom_territory_id,
    territory_name: battle.territory_name
  };

  // Gang references already have clean field names from data layer
  if (battle.attacker) {
    transformed.attacker = {
      id: battle.attacker.id,
      name: battle.attacker.name
    };
  }

  if (battle.defender) {
    transformed.defender = {
      id: battle.defender.id,
      name: battle.defender.name
    };
  }

  if (battle.winner) {
    transformed.winner = {
      id: battle.winner.id,
      name: battle.winner.name
    };
  }

  return transformed;
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
    // Extract client IP from Vercel headers
    const clientIP = getClientIP(request);

    // Apply rate limiting (10 requests per minute per IP)
    const rateLimitResult = checkExportRateLimit(clientIP);

    if (!rateLimitResult.allowed) {
      const resetSeconds = Math.ceil((rateLimitResult.reset - Date.now()) / 1000);
      const errorMessage = `Rate limit exceeded. Maximum ${rateLimitResult.limit} requests per minute per IP. Retry in ${resetSeconds} seconds.`;

      const rateLimitHeaders = {
        'X-RateLimit-Limit': String(rateLimitResult.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.reset / 1000)),
        'Retry-After': String(resetSeconds),
      };

      return format === 'xml'
        ? new NextResponse(objectToXml({ error: errorMessage }, 'error'), {
            status: 429,
            headers: { ...rateLimitHeaders, 'Content-Type': 'application/xml' }
          })
        : NextResponse.json({ error: errorMessage }, {
            status: 429,
            headers: rateLimitHeaders
          });
    }

    // Prepare rate limit headers for successful responses
    const rateLimitHeaders = {
      'X-RateLimit-Limit': String(rateLimitResult.limit),
      'X-RateLimit-Remaining': String(rateLimitResult.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.reset / 1000)),
    };

    // Create service role client to bypass RLS for public export access
    // SECURITY NOTE: This endpoint is intentionally public - any campaign ID can be exported
    // Rate limiting (10 req/min per IP) provides abuse protection
    const supabase = createServiceRoleClient();

    // Fetch all campaign data using existing cached functions
    const [
      campaignBasic,
      campaignMembers,
      campaignTerritories,
      campaignBattles
    ] = await Promise.all([
      getCampaignBasic(campaignId, supabase),
      getCampaignMembers(campaignId, supabase),
      getCampaignTerritories(campaignId, supabase),
      getCampaignBattles(campaignId, 100, supabase)
    ]);

    // Return 404 if campaign not found
    if (!campaignBasic) {
      return format === 'xml'
        ? new NextResponse(objectToXml({ error: 'Campaign not found' }, 'error'), {
            status: 404,
            headers: { 'Content-Type': 'application/xml', ...rateLimitHeaders }
          })
        : NextResponse.json(
            { error: 'Campaign not found' },
            { status: 404, headers: rateLimitHeaders }
          );
    }

    // Transform members data to include territories under their gangs
    // Note: We exclude auth user IDs for privacy, only include campaign-scoped IDs
    const membersWithTerritories = campaignMembers.map(member => {
      const gangsWithTerritories = member.gangs.map(gang => {
        // Find territories owned by this gang
        const gangTerritories = campaignTerritories.filter(
          territory => territory.gang_id === gang.id
        );

        return transformGangForExport({
          ...gang,
          territories: gangTerritories
        });
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
        has_scavenging_rolls: campaignBasic.has_scavenging_rolls,
        has_power: campaignBasic.has_power,
        has_sustenance: campaignBasic.has_sustenance,
        has_salvage: campaignBasic.has_salvage
      },
      members: membersWithTerritories,
      available_territories: campaignTerritories.map(t => transformTerritoryForExport(t, false)),
      battle_logs: campaignBattles.map(transformBattleForExport)
    };

    // Return based on requested format
    if (format === 'xml') {
      const xmlContent = objectToXml(exportData, 'campaign_export');
      return new NextResponse(xmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `inline; filename="campaign_${campaignId}.xml"`,
          ...rateLimitHeaders
        }
      });
    }

    return NextResponse.json(exportData, { headers: rateLimitHeaders });
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
