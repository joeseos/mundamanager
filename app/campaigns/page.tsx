import { createClient } from "@/utils/supabase/server";
import CreateCampaign from '@/components/create-campaign'
import MyCampaigns from '@/components/my-campaigns'
import { CampaignsProvider } from '@/contexts/CampaignsContext'

export default async function CampaignsPage() {
  const supabase = await createClient();
  
  // Get the user data once at the page level
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const { data: campaignTypes, error } = await supabase
    .from('campaign_types')
    .select('id, campaign_type_name');

  if (error) {
    console.error('Error fetching campaign types:', error);
  }

  return (
    <CampaignsProvider userId={userId}>
      <main className="flex min-h-screen flex-col items-center">
        <div className="container mx-auto max-w-4xl w-full space-y-4">
          <CreateCampaign initialCampaignTypes={campaignTypes} userId={userId} />
          <MyCampaigns />
        </div>
      </main>
    </CampaignsProvider>
  )
} 