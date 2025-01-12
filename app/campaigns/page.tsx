import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CreateCampaign from '@/components/create-campaign'
import MyCampaigns from '@/components/my-campaigns'
import { CampaignsProvider } from '@/contexts/CampaignsContext'

export default async function CampaignsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: campaignTypes, error } = await supabase
    .from('campaign_types')
    .select('id, campaign_type_name');

  if (error) {
    console.error('Error fetching campaign types:', error);
  }

  return (
    <CampaignsProvider>
      <main className="flex min-h-screen flex-col items-center">
        <div className="container mx-auto max-w-4xl w-full space-y-4">
          <CreateCampaign initialCampaignTypes={campaignTypes} />
          <MyCampaigns />
        </div>
      </main>
    </CampaignsProvider>
  )
} 