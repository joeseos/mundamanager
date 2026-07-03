import { createClient } from "@/utils/supabase/server";
import { notFound, unstable_rethrow } from "next/navigation";
import CampaignPageContent from "@/components/campaigns/[id]/campaign-page-content";
import { CampaignErrorBoundary } from "@/components/campaigns/campaign-error-boundary";
import { checkCampaignPermissions } from "@/utils/user-permissions";
import type { CampaignPermissions } from "@/types/user-permissions";
import { getAuthenticatedUser } from "@/utils/auth";

// Import the cached data loaders
import { 
  getCampaignBasic, 
  getCampaignMembers, 
  getCampaignTerritories, 
  getCampaignBattles,
  getCampaignTriumphs,
  getCampaignTypes,
  getAllTerritories,
  getCampaignGangsForModal,
  getCampaignAllegiances,
  getCampaignResources,
  getCampaignCaptives,
  getCampaignMapWithObjects
} from "@/app/lib/campaigns/[id]/get-campaign-data";

export default async function CampaignPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  // Get the user data once at the page level via claims
  let userId: string | undefined = undefined;
  try {
    const user = await getAuthenticatedUser(supabase);
    userId = user.id;
  } catch {}

  // Calculate permissions server-side
  let permissions: CampaignPermissions | null = null;
  if (userId) {
    try {
      permissions = await checkCampaignPermissions(userId, params.id);
    } catch (error) {
      console.error('Error calculating permissions:', error);
      // Set default read-only permissions on error
      permissions = {
        isOwner: false,
        isAdmin: false,
        canEdit: false,
        canDelete: false,
        canView: true,
        userId,
        isArbitrator: false,
        isMember: false,
        canEditCampaign: false,
        canDeleteCampaign: false,
        canManageMembers: false,
        canManageTerritories: false,
        canEditTerritories: false,
        canDeleteTerritories: false,
        canClaimTerritories: false,
        canAddBattleLogs: false,
        canEditBattleLogs: false,
        campaignRole: null
      };
    }
  }

  let pageProps;
  try {
    // PARALLEL DATA FETCHING - Main campaign data
    const [
      campaignBasic,
      campaignMembers,
      campaignTerritories,
      campaignBattles,
      campaignMapBundle,
      battleSessionsResult
    ] = await Promise.all([
      getCampaignBasic(params.id),
      getCampaignMembers(params.id),
      getCampaignTerritories(params.id),
      getCampaignBattles(params.id, 100),
      getCampaignMapWithObjects(params.id),
      supabase
        .from('battle_sessions')
        .select('*')
        .eq('campaign_id', params.id)
        .order('updated_at', { ascending: false }),
    ]);

    // Check if campaign exists
    if (!campaignBasic) {
      notFound();
    }

    const campaignMap = campaignMapBundle.map;
    const campaignMapObjects = campaignMapBundle.objects;

    // PARALLEL DATA FETCHING - Reference data for territory components
    const [
      campaignTriumphs,
      campaignTypes,
      allTerritories,
      tradingPostTypesResult,
      campaignAllegiances,
      campaignResources,
      campaignCaptives,
      customTradingPostsResult
    ] = await Promise.all([
      getCampaignTriumphs(campaignBasic.campaign_type_id),
      getCampaignTypes(),
      getAllTerritories(),
      supabase
        .from('trading_post_types')
        .select('id, trading_post_name')
        .order('trading_post_name'),
      getCampaignAllegiances(params.id),
      getCampaignResources(params.id),
      getCampaignCaptives(params.id, supabase),
      supabase
        .from('custom_shared')
        .select('custom_trading_post_id, custom_trading_posts!inner(id, custom_trading_post_name)')
        .eq('campaign_id', params.id)
        .not('custom_trading_post_id', 'is', null)
    ]);

    const tradingPostTypes = tradingPostTypesResult.data || [];
    const customTradingPostTypes = (customTradingPostsResult.data || []).map((row: any) => ({
      id: row.custom_trading_posts.id,
      trading_post_name: row.custom_trading_posts.custom_trading_post_name,
    }));

    // Combine the data
    const campaignData = {
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
      trading_posts: campaignBasic.trading_posts || [],
      custom_trading_posts: campaignBasic.custom_trading_posts || [],
      discord_guild_id: campaignBasic.discord_guild_id || null,
      discord_channel_id: campaignBasic.discord_channel_id || null,
      note: campaignBasic.note,
      members: campaignMembers,
      territories: campaignTerritories,
      battles: campaignBattles,
      battleSessions: battleSessionsResult.data || [],
      triumphs: campaignTriumphs,
      captives: campaignCaptives
    };
    
    if (!campaignData.id) {
      notFound();
    }
    
    pageProps = {
      campaignData,
      campaignTypes,
      allTerritories,
      tradingPostTypes,
      customTradingPostTypes,
      campaignAllegiances,
      campaignResources,
      campaignMap,
      campaignMapObjects,
    };
  } catch (error) {
    // Let Next.js control-flow errors (notFound/redirect) pass through so the
    // 404 page renders instead of the inline error UI below.
    unstable_rethrow(error);
    console.error('Error in CampaignPage:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return (
      <main className="flex min-h-screen flex-col items-center">
        <div className="container mx-auto max-w-4xl w-full space-y-4">
          <div className="text-red-500">Error loading campaign data</div>
          {error instanceof Error && (
            <div className="text-sm text-muted-foreground">{error.message}</div>
          )}
        </div>
      </main>
    );
  }

  return (
    <CampaignErrorBoundary>
      <CampaignPageContent
        campaignData={pageProps.campaignData}
        userId={userId}
        permissions={permissions}
        campaignTypes={pageProps.campaignTypes}
        allTerritories={pageProps.allTerritories}
        tradingPostTypes={pageProps.tradingPostTypes}
        customTradingPostTypes={pageProps.customTradingPostTypes}
        campaignAllegiances={pageProps.campaignAllegiances}
        campaignResources={pageProps.campaignResources}
        mapData={pageProps.campaignMap}
        mapObjects={pageProps.campaignMapObjects}
      />
    </CampaignErrorBoundary>
  );
} 