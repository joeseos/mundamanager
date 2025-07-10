import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import CampaignPageContent from "@/components/campaigns/[id]/campaign-page-content";
import { CampaignErrorBoundary } from "@/components/campaigns/campaign-error-boundary";
import { PermissionService } from "@/app/lib/user-permissions";
import type { CampaignPermissions } from "@/types/user-permissions";

// Import the optimized functions with unstable_cache
import { 
  getCampaignBasic, 
  getCampaignMembers, 
  getCampaignTerritories, 
  getCampaignBattles,
  getCampaignTriumphs,
  getCampaignTypes,
  getAllTerritories,
  getCampaignGangsForModal
} from "@/app/lib/campaigns/[id]/get-campaign-data";

export default async function CampaignPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  // Get the user data once at the page level
  const { data: user } = await supabase.auth.getUser();
  const userId = user && user.user ? user.user.id : undefined;

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
      getCampaignBasic(params.id),
      getCampaignMembers(params.id),
      getCampaignTerritories(params.id),
      getCampaignBattles(params.id)
    ]);

    // 🚀 PARALLEL DATA FETCHING - Reference data for territory components
    const [
      campaignTriumphs,
      campaignTypes,
      allTerritories
    ] = await Promise.all([
      getCampaignTriumphs(campaignBasic.campaign_type_id),
      getCampaignTypes(),
      getAllTerritories()
    ]);

    // Combine the data
    const campaignData = {
      id: campaignBasic.id,
      campaign_name: campaignBasic.campaign_name,
      campaign_type_id: campaignBasic.campaign_type_id,
      campaign_type_name: (campaignBasic.campaign_types as any)?.campaign_type_name || '',
      status: campaignBasic.status,
      description: campaignBasic.description,
      created_at: campaignBasic.created_at,
      updated_at: campaignBasic.updated_at,
      has_meat: campaignBasic.has_meat,
      has_exploration_points: campaignBasic.has_exploration_points,
      has_scavenging_rolls: campaignBasic.has_scavenging_rolls,
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
        />
      </CampaignErrorBoundary>
    );
  } catch (error) {
    console.error('Error in CampaignPage:', error);
    return (
      <main className="flex min-h-screen flex-col items-center">
        <div className="container mx-auto max-w-4xl w-full space-y-4">
          <div className="text-red-500">Error loading campaign data</div>
        </div>
      </main>
    );
  }
} 