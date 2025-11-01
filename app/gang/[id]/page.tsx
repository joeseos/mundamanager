import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import GangPageContent from "@/components/gang/gang-page-content";
import { PermissionService } from "@/app/lib/user-permissions";
import { getAuthenticatedUser } from "@/utils/auth";

/**
 * Initialize or fix fighter positioning
 * - Creates initial positions if none exist
 * - Removes positions for deleted fighters
 * - Fixes gaps in position numbers
 * - Updates database if positions changed
 */
async function initializeOrFixPositioning(
  positioning: Record<string, any> | null,
  fighters: Array<{ id: string; fighter_name: string }>,
  gangId: string,
  supabase: any
): Promise<Record<string, any>> {
  let pos = positioning || {};

  // If no positions exist, create initial positions sorted by fighter name
  if (Object.keys(pos).length === 0) {
    const sortedFighters = [...fighters].sort((a, b) =>
      a.fighter_name.localeCompare(b.fighter_name)
    );

    pos = sortedFighters.reduce((acc, fighter, index) => ({
      ...acc,
      [index]: fighter.id
    }), {});
  } else {
    // Filter out positions referencing non-existent fighters
    const validFighterIds = new Set(fighters.map(f => f.id));
    const validPositions: Record<string, string> = {};

    Object.entries(pos as Record<string, string>).forEach(([position, fighterId]) => {
      if (validFighterIds.has(fighterId)) {
        validPositions[position] = fighterId;
      }
    });

    // Fix gaps in position numbers
    const currentPositions = Object.keys(validPositions).map(p => Number(p)).sort((a, b) => a - b);
    let expectedPosition = 0;
    const positionMapping: Record<number, number> = {};

    currentPositions.forEach(position => {
      positionMapping[position] = expectedPosition;
      expectedPosition++;
    });

    // Create new positioning with corrected positions
    const newPositioning: Record<number, string> = {};
    for (const [position, fighterId] of Object.entries(validPositions)) {
      newPositioning[positionMapping[Number(position)] ?? expectedPosition++] = fighterId;
    }
    pos = newPositioning;

    // Ensure each fighter has a position
    fighters.forEach(fighter => {
      if (!Object.values(pos).includes(fighter.id)) {
        pos[expectedPosition++] = fighter.id;
      }
    });
  }

  // Check if positions changed
  const positionsChanged = !positioning ||
    Object.entries(pos).some(([id, fId]) => positioning[id] !== fId);

  // Update database if positions changed
  if (positionsChanged) {
    const { error } = await supabase
      .from('gangs')
      .update({ positioning: pos })
      .eq('id', gangId);

    if (error) {
      console.error('Error updating positions:', error);
    }
  }

  return pos;
}

export default async function GangPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  // Get authenticated user via claims (no extra network call)
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect("/sign-in");
  }

  try {
    // Fetch gang data using granular shared functions
    const {
      getGangBasic,
      getGangPositioning,
      getGangType,
      getAlliance,
      getGangFightersList,
      getGangVehicles,
      getGangStash,
      getGangCampaigns,
      getGangVariants,
      getGangRating,
      getGangCredits,
      getUserProfile
    } = await import('@/app/lib/shared/gang-data');

    // Get supabase client first to pass to all functions
    const supabase = await createClient();

    // Fetch basic gang data first to check if gang exists
    const gangBasic = await getGangBasic(params.id, supabase);
    
    if (!gangBasic) {
      notFound();
    }

    // Fetch all related data in parallel using granular functions
    const permissionService = new PermissionService();
    const [
      gangPositioning,
      gangType,
      alliance,
      fighters,
      vehicles,
      stash,
      campaigns,
      gangCredits,
      gangVariants,
      gangRating,
      userProfile,
      userPermissions
    ] = await Promise.all([
      getGangPositioning(params.id, supabase),
      getGangType(gangBasic.gang_type_id, supabase),
      getAlliance(gangBasic.alliance_id, supabase),
      getGangFightersList(params.id, supabase),
      getGangVehicles(params.id, supabase),
      getGangStash(params.id, supabase),
      getGangCampaigns(params.id, supabase),
      getGangCredits(params.id, supabase),
      getGangVariants(gangBasic.gang_variants || [], supabase),
      getGangRating(params.id, supabase),
      getUserProfile(gangBasic.user_id, supabase),
      permissionService.getGangPermissions(user.id, params.id)
    ]);

    // Initialize or fix positioning for fighters
    const processedPositioning = await initializeOrFixPositioning(
      gangPositioning,
      fighters,
      params.id,
      supabase
    );

    // Assemble the gang data structure for client
    // NOTE: fighters are already fully processed from getGangFightersList with shared cache tags
    const gangDataForClient = {
      id: gangBasic.id,
      name: gangBasic.name,
      gang_type: gangBasic.gang_type,
      gang_type_id: gangBasic.gang_type_id,
      gang_type_image_url: gangType.image_url,
      image_url: gangBasic.image_url,
      gang_colour: gangBasic.gang_colour,
      credits: gangCredits,
      reputation: gangBasic.reputation,
      meat: gangBasic.meat,
      scavenging_rolls: gangBasic.scavenging_rolls,
      exploration_points: gangBasic.exploration_points,
      power: gangBasic.power,
      sustenance: gangBasic.sustenance,
      salvage: gangBasic.salvage,
      rating: gangRating,
      alignment: gangBasic.alignment,
      alliance_name: alliance?.alliance_name || "",
      gang_affiliation_id: gangBasic.gang_affiliation_id || null,
      gang_affiliation_name: gangBasic.gang_affiliation?.name || "",
      gang_type_has_affiliation: gangBasic.gang_types?.affiliation || false,
      gang_origin_id: gangBasic.gang_origin_id || null,
      gang_origin_name: gangBasic.gang_origin?.origin_name || "",
      gang_origin_category_name: gangBasic.gang_types?.gang_origin_categories?.category_name || "",
      gang_type_has_origin: !!gangBasic.gang_types?.gang_origin_category_id,
      positioning: processedPositioning,
      note: gangBasic.note,
      note_backstory: gangBasic.note_backstory,
      stash: stash,
      created_at: gangBasic.created_at,
      last_updated: gangBasic.last_updated,
      fighters: fighters, // Already fully processed with shared cache tags
      campaigns: campaigns,
      vehicles: vehicles,
      alliance_id: gangBasic.alliance_id,
      alliance_type: alliance?.alliance_type,
      gang_variants: gangVariants,
      gang_affiliation: gangBasic.gang_affiliation,
      gang_origin: gangBasic.gang_origin,
      gang_types: gangBasic.gang_types,
      user_id: gangBasic.user_id,
      username: userProfile?.username,
      patreon_tier_id: userProfile?.patreon_tier_id,
      patreon_tier_title: userProfile?.patreon_tier_title,
      patron_status: userProfile?.patron_status
    };

    return (
      <GangPageContent
        initialGangData={gangDataForClient}
        gangId={params.id}
        userId={user.id}
        userPermissions={userPermissions}
      />
    );
  } catch (error) {
    console.error('Error in GangPage:', error);
    throw error;
  }
}