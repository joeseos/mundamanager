import { createClient } from "@/utils/supabase/server";
import { redirect, notFound, forbidden, unstable_rethrow } from "next/navigation";
import GangPageContent from "@/components/gang/gang-page-content";
import { canViewHiddenGang, checkPermissionCached } from "@/utils/user-permissions";
import { getAuthenticatedUser, signInPath } from "@/utils/auth";
import { initializePositioningIfNeeded } from "@/utils/fighter-positioning";
import {
  getGangCore,
  getGangPositioning,
  getGangType,
  getGangTypeConfig,
  getGangFightersBundle,
  getGangStash,
  getGangCampaigns,
  getGangSubtypes,
  getGangTacticsCards,
  getUserProfile
} from '@/app/lib/shared/gang-data';
import { assembleGangFighters, assembleGangVehicles } from '@/utils/gang-assembly';
import { getGangBattleSessionsCached } from '@/app/lib/battle-sessions/get-battle-session-data';
import { hasGangTacticsCards } from '@/types/edition';

export default async function GangPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  // Get authenticated user via claims (no extra network call)
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect(signInPath(`/gang/${params.id}`));
  }

  let pageProps;
  try {
    // Fetch the gang core first to check if gang exists
    const gangBasic = await getGangCore(params.id, supabase);

    if (!gangBasic) {
      notFound();
    }

    const canView = await canViewHiddenGang(
      user.id,
      params.id,
      gangBasic.user_id,
      gangBasic.hidden
    );

    if (!canView) {
      forbidden();
    }

    // Credits, rating, wealth and alliance come from the gang core entry
    const alliance = gangBasic.alliance;

    // Fetch all related data in parallel
    const [
      gangPositioning,
      gangType,
      roster,
      stash,
      campaigns,
      gangSubtypes,
      userProfile,
      userPermissions,
      battleSessions,
      tacticsCards
    ] = await Promise.all([
      getGangPositioning(params.id, supabase),
      getGangType(gangBasic, supabase),
      // Assembled inside the batch so the CPU pass overlaps the remaining
      // queries rather than landing on the critical path after all ten resolve.
      getGangFightersBundle(params.id, supabase).then((bundle) => ({
        fighters: assembleGangFighters(bundle, {
          gangEditionSlug: gangBasic.edition_slug ?? null
        }),
        vehicles: assembleGangVehicles(bundle)
      })),
      getGangStash(params.id, supabase),
      getGangCampaigns(params.id, supabase),
      getGangSubtypes(gangBasic.gang_subtypes || [], supabase),
      getUserProfile(gangBasic.user_id, supabase),
      checkPermissionCached(user.id, params.id, gangBasic.user_id),
      getGangBattleSessionsCached(params.id, supabase),
      // Editions without Gang Tactics never render the section.
      hasGangTacticsCards(gangBasic.edition_slug)
        ? getGangTacticsCards(params.id, supabase)
        : Promise.resolve([])
    ]);

    const { fighters, vehicles } = roster;

    // Initialize positioning if needed (lazy initialization only)
    const processedPositioning = await initializePositioningIfNeeded(
      gangPositioning,
      fighters,
      params.id,
      supabase
    );

    // Assemble the gang data structure for client
    const gangTypeConfig = getGangTypeConfig(gangBasic);
    const gangDataForClient = {
      id: gangBasic.id,
      name: gangBasic.name,
      gang_type: gangBasic.gang_type,
      gang_type_id: gangBasic.gang_type_id,
      custom_gang_type_id: gangBasic.custom_gang_type_id || null,
      edition_slug: gangBasic.edition_slug ?? null,
      gang_type_image_url: gangType.image_url,
      image_url: gangBasic.image_url,
      default_gang_image: gangBasic.default_gang_image ?? null,
      gang_type_default_image_urls: gangType.default_image_urls ?? undefined,
      gang_colour: gangBasic.gang_colour,
      credits: gangBasic.credits,
      reputation: gangBasic.reputation,
      trade_points: gangBasic.trade_points,
      rating: gangBasic.rating,
      wealth: gangBasic.wealth,
      alignment: gangBasic.alignment,
      alliance_name: alliance?.alliance_name || "",
      gang_affiliation_id: gangBasic.gang_affiliation_id || null,
      gang_affiliation_name: gangBasic.gang_affiliation?.name || "",
      gang_type_has_affiliation: ('affiliation' in (gangTypeConfig ?? {}) ? (gangTypeConfig as any).affiliation : false),
      gang_origin_id: gangBasic.gang_origin_id || null,
      gang_origin_name: gangBasic.gang_origin?.origin_name || "",
      gang_origin_category_name: gangTypeConfig?.gang_origin_categories?.category_name || "",
      gang_type_has_origin: !!gangTypeConfig?.gang_origin_category_id,
      positioning: processedPositioning,
      note: gangBasic.note,
      note_backstory: gangBasic.note_backstory,
      note_private: userPermissions.canEdit ? gangBasic.note_private : undefined,
      note_private_updated_at: userPermissions.canEdit ? gangBasic.note_private_updated_at : undefined,
      stash: stash,
      created_at: gangBasic.created_at,
      last_updated: gangBasic.last_updated,
      fighters: fighters, // Already fully processed with shared cache tags
      campaigns: campaigns,
      vehicles: vehicles,
      alliance_id: gangBasic.alliance_id,
      gang_subtypes: gangSubtypes,
      user_id: gangBasic.user_id,
      username: userProfile?.username,
      patreon_tier_id: userProfile?.patreon_tier_id,
      patreon_tier_title: userProfile?.patreon_tier_title,
      patron_status: userProfile?.patron_status,
      hidden: gangBasic.hidden,
      battleSessions: battleSessions,
      tacticsCards: tacticsCards
    };

    pageProps = { gangDataForClient, userPermissions };
  } catch (error) {
    // notFound()/forbidden()/redirect() signal by throwing; let them through
    // untouched so they are not logged as failures.
    unstable_rethrow(error);
    console.error('Error in GangPage:', error);
    throw error;
  }

  // JSX is constructed outside the try: React renders it after this function
  // returns, so the catch could never see a render error anyway.
  return (
    <GangPageContent
      initialGangData={pageProps.gangDataForClient}
      gangId={params.id}
      userId={user.id}
      userPermissions={pageProps.userPermissions}
    />
  );
}
