import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import { PermissionService } from "@/app/lib/user-permissions";
import { getAuthenticatedUser } from "@/utils/auth";
import GangRoster from "@/components/gang/print-gang-roster";
import type { FighterProps } from "@/types/fighter";
import { initializeOrFixPositioning } from "@/utils/fighter-positioning";

export default async function GangRosterPage(props: {
  params: Promise<{ id: string }>;
}) {
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
      getGangStash,
      getGangCampaigns,
      getGangVariants,
      getGangRatingAndWealth,
      getGangCredits,
      getUserProfile,
    } = await import("@/app/lib/shared/gang-data");

    // Get supabase client first to pass to all functions
    const supabaseForData = await createClient();

    // Fetch basic gang data first to check if gang exists
    const gangBasic = await getGangBasic(params.id, supabaseForData);

    if (!gangBasic) {
      notFound();
    }

    // Check if user can view hidden gang
    const permissionService = new PermissionService();
    const canView = await permissionService.canViewHiddenGang(
      user.id,
      params.id,
      gangBasic.hidden,
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
      stash,
      campaigns,
      gangCredits,
      gangVariants,
      gangRatingAndWealth,
      userProfile,
    ] = await Promise.all([
      getGangPositioning(params.id, supabaseForData),
      getGangType(gangBasic.gang_type_id, supabaseForData),
      getAlliance(gangBasic.alliance_id, supabaseForData),
      getGangFightersList(params.id, supabaseForData),
      getGangStash(params.id, supabaseForData),
      getGangCampaigns(params.id, supabaseForData),
      getGangCredits(params.id, supabaseForData),
      getGangVariants(gangBasic.gang_variants || [], supabaseForData),
      getGangRatingAndWealth(params.id, supabaseForData),
      getUserProfile(gangBasic.user_id, supabaseForData),
    ]);

    // Initialize or fix positioning for fighters
    const processedPositioning = await initializeOrFixPositioning(
      gangPositioning,
      fighters,
      params.id,
      supabaseForData,
    );

    // Assemble the gang data structure for the roster view
    const gangDataForClient = {
      id: gangBasic.id,
      name: gangBasic.name,
      gang_type: gangBasic.gang_type,
      gang_type_id: gangBasic.gang_type_id,
      gang_type_image_url: gangType.image_url,
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
      gang_affiliation_name: gangBasic.gang_affiliation?.name || "",
      created_at: gangBasic.created_at,
      last_updated: gangBasic.last_updated,
      // Cast fighters so they satisfy the FighterProps-based shape expected by GangRoster/calculateAdjustedStats
      fighters: fighters as unknown as FighterProps[],
      stash,
      campaigns,
      gang_variants: gangVariants,
      user_id: gangBasic.user_id,
      username: userProfile?.username,
      hidden: gangBasic.hidden,
      positioning: processedPositioning,
    };

    return (
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[calc(-50vw+50%)]">
        <GangRoster gang={gangDataForClient} />
      </div>
    );
  } catch (error) {
    console.error("Error in GangRosterPage:", error);
    throw error;
  }
}


