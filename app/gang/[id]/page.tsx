import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import GangPageContent from "@/components/gang/gang-page-content";
import { PermissionService } from "@/app/lib/user-permissions";
import { getAuthenticatedUser } from "@/utils/auth";
import { initializePositioningIfNeeded } from "@/utils/fighter-positioning";
import {
  getGangBasic,
  getGangPositioning,
  getGangType,
  getAlliance,
  getGangFightersList,
  getGangVehicles,
  getGangStash,
  getGangCampaigns,
  getGangVariants,
  getGangRatingAndWealth,
  getGangCredits,
  getUserProfile
} from '@/app/lib/shared/gang-data';

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
    // Fetch basic gang data first to check if gang exists
    const gangBasic = await getGangBasic(params.id, supabase);

    if (!gangBasic) {
      notFound();
    }

    // Check if user can view hidden gang
    const permissionService = new PermissionService();
    const canView = await permissionService.canViewHiddenGang(
      user.id,
      params.id,
      gangBasic.hidden
    );

    if (!canView) {
      notFound();
    }

    // Fetch all related data in parallel using granular functions
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
      gangRatingAndWealth,
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
      getGangRatingAndWealth(params.id, supabase),
      getUserProfile(gangBasic.user_id, supabase),
      permissionService.getGangPermissions(user.id, params.id)
    ]);

    // Initialize positioning if needed (lazy initialization only)
    const processedPositioning = await initializePositioningIfNeeded(
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
      default_gang_image: gangBasic.default_gang_image ?? null,
      gang_type_default_image_urls: gangType.default_image_urls ?? undefined,
      gang_colour: gangBasic.gang_colour,
      credits: gangCredits,
      reputation: gangBasic.reputation,
      meat: gangBasic.meat,
      scavenging_rolls: gangBasic.scavenging_rolls,
      exploration_points: gangBasic.exploration_points,
      power: gangBasic.power,
      sustenance: gangBasic.sustenance,
      salvage: gangBasic.salvage,
      rating: gangRatingAndWealth.rating,
      wealth: gangRatingAndWealth.wealth,
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
      patron_status: userProfile?.patron_status,
      hidden: gangBasic.hidden
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