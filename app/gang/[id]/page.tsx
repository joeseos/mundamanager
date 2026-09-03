import { createClient } from "@/utils/supabase/server";
import { redirect, notFound, forbidden } from "next/navigation";
import GangPageContent from "@/components/gang/gang-page-content";
import { canViewHiddenGang, checkPermissionCached } from "@/utils/user-permissions";
import { getAuthenticatedUser, signInPath } from "@/utils/auth";
import { resolvePositioning } from "@/utils/fighter-positioning";
import {
  getGangCore,
  getGangPositioning,
  getGangType,
  getGangTypeConfig,
  getGangFightersList,
  getGangVehicles,
  getGangStash,
  getGangCampaigns,
  getGangVariants,
  getGangTacticsCards,
  getUserProfile
} from '@/app/lib/shared/gang-data';
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
      fighters,
      vehicles,
      stash,
      campaigns,
      gangVariants,
      userProfile,
      userPermissions,
      battleSessions,
      tacticsCards
    ] = await Promise.all([
      getGangPositioning(params.id, supabase),
      getGangType(gangBasic, supabase),
      getGangFightersList(params.id, supabase),
      getGangVehicles(params.id, supabase),
      getGangStash(params.id, supabase),
      getGangCampaigns(params.id, supabase),
      getGangVariants(gangBasic.gang_variants || [], supabase),
      getUserProfile(gangBasic.user_id, supabase),
      checkPermissionCached(user.id, params.id, gangBasic.user_id),
      getGangBattleSessionsCached(params.id, supabase),
      // Editions without Gang Tactics never render the section.
      hasGangTacticsCards(gangBasic.edition_slug)
        ? getGangTacticsCards(params.id, supabase)
        : Promise.resolve([])
    ]);

    // Default order when the gang has never been reordered; derived, not persisted.
    const processedPositioning = resolvePositioning(gangPositioning, fighters);

    // Assemble the gang data structure for client
    // NOTE: fighters are already fully processed from getGangFightersList with shared cache tags
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
      hidden: gangBasic.hidden,
      battleSessions: battleSessions,
      tacticsCards: tacticsCards
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