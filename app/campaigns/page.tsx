import { createClient } from "@/utils/supabase/server";
import CreateCampaign from '@/components/create-campaign'
import MyCampaigns from '@/components/my-campaigns'
import { getUserCampaigns } from '@/app/lib/get-user-campaigns';
import { unstable_noStore } from 'next/cache';
import { getAuthenticatedUser } from "@/utils/auth";

export default async function CampaignsPage() {
  // Ensure we never use stale data
  unstable_noStore();
  
  const supabase = await createClient();
  
  // Get the user data once at the page level via claims
  let userId: string | undefined = undefined;
  try {
    const user = await getAuthenticatedUser(supabase);
    userId = user.id;
  } catch {}

  const { data: campaignTypes, error } = await supabase
    .from('campaign_types')
    .select('id, campaign_type_name');

  if (error) {
    console.error('Error fetching campaign types:', error);
  }

  // Fetch campaigns server-side
  const campaigns = await getUserCampaigns();
  console.log(`Page rendering with ${campaigns.length} campaigns`);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-4xl w-full space-y-4">
        <CreateCampaign initialCampaignTypes={campaignTypes} userId={userId} />
        <MyCampaigns campaigns={campaigns} />
      </div>
    </main>
  )
} 