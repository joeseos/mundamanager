import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import CampaignPageContent from "@/components/campaign/campaign-page-content";
import { CampaignErrorBoundary } from "@/components/campaign/campaign-error-boundary";
import { PermissionService } from "@/app/lib/user-permissions";
import type { CampaignPermissions } from "@/types/user-permissions";

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
    const { data, error } = await supabase
      .rpc('get_campaign_details', {
        campaign_id: params.id
      });

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    const [campaignData] = data || [];
    
    if (!campaignData) {
      notFound();
    }
    
    return (
      <CampaignErrorBoundary>
        <CampaignPageContent 
          campaignData={campaignData} 
          userId={userId} 
          permissions={permissions}
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