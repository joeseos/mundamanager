import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import CampaignPageContent from "@/components/campaigns/[id]/campaign-page-content";
import { CampaignErrorBoundary } from "@/components/campaigns/campaign-error-boundary";
import { PermissionService } from "@/app/lib/user-permissions";
import type { CampaignPermissions } from "@/types/user-permissions";
import { getAuthenticatedUser } from "@/utils/auth";

// Import the optimized functions with unstable_cache
import { 
  getCampaignBasic, 
  getCampaignMembers, 
  getCampaignTerritories, 
  getCampaignBattles,
  getCampaignTriumphs,
  getCampaignTypes,
  getAllTerritories,
  getAllTerritoriesWithCustom,
  getCampaignGangsForModal,
  getCampaignAllegiances
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
      const permissionService = new PermissionService();
      permissions = await permissionService.getCampaignPermissions(userId, params.id);
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

  try {
    // 🚀 PARALLEL DATA FETCHING - Main campaign data
    const [
      campaignBasic,
      campaignMembers,
      campaignTerritories,
      campaignBattles
    ] = await Promise.all([
      getCampaignBasic(params.id, supabase),
      getCampaignMembers(params.id, supabase),
      getCampaignTerritories(params.id, supabase),
      getCampaignBattles(params.id, 100, supabase)
    ]);

    // Check if campaign exists
    if (!campaignBasic) {
      notFound();
    }

    // 🚀 PARALLEL DATA FETCHING - Reference data for territory components
    const [
      campaignTriumphs,
      campaignTypes,
      allTerritories,
      tradingPostTypesResult,
      campaignAllegiances
    ] = await Promise.all([
      getCampaignTriumphs(campaignBasic.campaign_type_id),
      getCampaignTypes(),
      userId ? getAllTerritoriesWithCustom(userId) : getAllTerritories(),
      supabase
        .from('trading_post_types')
        .select('id, trading_post_name')
        .order('trading_post_name'),
      getCampaignAllegiances(params.id, supabase)
    ]);

    const tradingPostTypes = tradingPostTypesResult.data || [];

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
      has_meat: campaignBasic.has_meat,
      has_exploration_points: campaignBasic.has_exploration_points,
      has_scavenging_rolls: campaignBasic.has_scavenging_rolls,
      has_power: campaignBasic.has_power,
      has_sustenance: campaignBasic.has_sustenance,
      has_salvage: campaignBasic.has_salvage,
      trading_posts: campaignBasic.trading_posts || [],
      note: campaignBasic.note,
      members: campaignMembers,
      territories: campaignTerritories,
      battles: campaignBattles,
      triumphs: campaignTriumphs
    };
    
    if (!campaignData.id) {
      notFound();
    }
    
    return (
      <CampaignErrorBoundary>
        <CampaignPageContent 
          campaignData={campaignData} 
          userId={userId} 
          permissions={permissions}
          campaignTypes={campaignTypes}
          allTerritories={allTerritories}
          tradingPostTypes={tradingPostTypes}
          campaignAllegiances={campaignAllegiances}
        />
      </CampaignErrorBoundary>
    );
  } catch (error) {
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
} 