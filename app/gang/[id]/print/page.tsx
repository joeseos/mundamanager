import { createClient } from "@/utils/supabase/server";
import { redirect, notFound, forbidden } from "next/navigation";

export const dynamic = "force-dynamic";
import { canViewHiddenGang } from "@/utils/user-permissions";
import { getAuthenticatedUser, signInPath } from "@/utils/auth";
import { initializePositioningIfNeeded } from "@/utils/fighter-positioning";
import PrintGang from "@/components/gang/print-gang";
import type { FighterProps } from "@/types/fighter";

export default async function PrintGangPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const supabase = await createClient();

  // Get authenticated user via claims (no extra network call)
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect(signInPath(`/gang/${params.id}/print`));
  }

  let gangDataForClient;
  try {
    // Fetch gang data using granular shared functions
    const {
      getGangBasic,
      getGangPositioning,
      getGangType,
      getGangTypeConfig,
      getAlliance,
      getGangFightersList,
      getGangCampaigns,
      getGangVariants,
      getGangRatingAndWealth,
      getGangCredits,
      getGangStash,
      getUserProfile,
    } = await import("@/app/lib/shared/gang-data");

    // Fetch basic gang data first to check if gang exists
    const gangBasic = await getGangBasic(params.id);

    if (!gangBasic) {
      notFound();
    }

    // Check if user can view hidden gang
    const canView = await canViewHiddenGang(
      user.id,
      params.id,
      gangBasic.user_id,
      gangBasic.hidden,
    );

    if (!canView) {
      forbidden();
    }

    // Fetch all related data in parallel using granular functions
    const [
      gangPositioning,
      gangType,
      alliance,
      fighters,
      campaigns,
      gangCredits,
      gangVariants,
      gangRatingAndWealth,
      stash,
      ownerProfile,
    ] = await Promise.all([
      getGangPositioning(params.id),
      getGangType(gangBasic.gang_type_id, gangBasic.custom_gang_type_id),
      getAlliance(gangBasic.alliance_id),
      getGangFightersList(params.id, { expandLoadoutsForPrint: true }),
      getGangCampaigns(params.id),
      getGangCredits(params.id),
      getGangVariants(gangBasic.gang_variants || []),
      getGangRatingAndWealth(params.id),
      getGangStash(params.id),
      getUserProfile(gangBasic.user_id),
    ]);

    // Initialize positioning if needed (lazy initialization only)
    const processedPositioning = await initializePositioningIfNeeded(
      gangPositioning,
      fighters,
      params.id,
      supabase,
    );

    // Pre-filter to active loadout only (computed on server - avoids client serialization issues)
    const fightersActiveLoadoutOnly = (fighters as { id: string; active_loadout_id?: string; isActiveLoadoutForPrint?: boolean }[])
      .filter((f) => f.isActiveLoadoutForPrint === true);

    const gangTypeConfig = getGangTypeConfig(gangBasic);

    // Assemble the gang data structure for the roster view
    gangDataForClient = {
      id: gangBasic.id,
      name: gangBasic.name,
      gang_type: gangBasic.gang_type,
      gang_type_id: gangBasic.gang_type_id,
      gang_type_image_url: gangType.image_url,
      image_url: gangBasic.image_url,
      gang_colour: gangBasic.gang_colour,
      credits: gangCredits,
      reputation: gangBasic.reputation,
      rating: gangRatingAndWealth.rating,
      wealth: gangRatingAndWealth.wealth,
      alignment: gangBasic.alignment,
      alliance_name: alliance?.alliance_name || "",
      gang_affiliation_name: gangBasic.gang_affiliation?.name || "",
      gang_origin_name: gangBasic.gang_origin?.origin_name || "",
      gang_origin_category_name: gangTypeConfig?.gang_origin_categories?.category_name || "",
      gang_type_has_origin: !!gangTypeConfig?.gang_origin_category_id,
      created_at: gangBasic.created_at,
      last_updated: gangBasic.last_updated,
      // Cast fighters so they satisfy the FighterProps-based shape expected by PrintGang/calculateAdjustedStats
      fighters: fighters as unknown as FighterProps[],
      fightersActiveLoadoutOnly: fightersActiveLoadoutOnly as unknown as FighterProps[],
      stash,
      campaigns,
      gang_variants: gangVariants,
      username: ownerProfile?.username,
      patreon_tier_id: ownerProfile?.patreon_tier_id,
      patreon_tier_title: ownerProfile?.patreon_tier_title,
      hidden: gangBasic.hidden,
      positioning: processedPositioning,
      note: gangBasic.note,
    };
  } catch (error) {
    console.error("Error in PrintGangPage:", error);
    throw error;
  }

  return (
    <div className="w-full relative">
      <PrintGang gang={gangDataForClient} />
    </div>
  );
}

