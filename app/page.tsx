// This page uses server components and React's cache for data fetching
// Server actions should trigger revalidation of this data using revalidatePath

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import MyGangs from '@/components/my-gangs';
import MyCampaigns from '@/components/my-campaigns';
import { CreateGangButton } from '@/components/create-gang-modal';
import { CreateCampaignButton } from '@/components/create-campaign';
import CreateCampaign from '@/components/create-campaign';
import { getUserGangs } from '@/app/lib/get-user-gangs';
import { getUserCampaigns } from '@/app/lib/get-user-campaigns';
import { unstable_noStore } from 'next/cache';
import { FaDiscord, FaPatreon } from "react-icons/fa6";
import HomeTabs from '@/components/home-tabs';
import { getAuthenticatedUser } from '@/utils/auth';

export default async function Home() {
  // Ensure we never use stale data
  unstable_noStore();
  
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  // Single invocation that gets both gangs and campaigns
  const [gangs, campaigns] = await Promise.all([
    getUserGangs(),
    getUserCampaigns()
  ]);
  
  // Fetch campaign types for the create campaign modal
  const { data: campaignTypes, error } = await supabase
    .from('campaign_types')
    .select('id, campaign_type_name');

  if (error) {
    console.error('Error fetching campaign types:', error);
  }

  console.log(`Page rendering with ${gangs.length} gangs and ${campaigns.length} campaigns`);

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-4 md:p-4">
          <div className="mb-0">
            <h1 className="text-xl md:text-2xl font-bold mb-2">Welcome to Munda Manager</h1>
            <p className="text-gray-600 mb-4">
              Join our Discord community to chat or get help with Necromunda and Munda Manager.
            </p>
            <div>
              <div className="flex gap-2">
                <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted w-full">
                  <FaDiscord className="mr-2 h-4 w-4" />
                  Discord
                </a>
                <a href="https://www.patreon.com/c/mundamanager" target="_blank" rel="noopener noreferrer" className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted w-full">
                  <FaPatreon className="mr-2 h-4 w-4" />
                  Patreon
                </a>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[135px] sm:w-auto w-full">
                  <CreateGangButton />
                </div>
                <div className="flex-1 min-w-[135px] sm:w-auto w-full">
                  <CreateCampaignButton initialCampaignTypes={campaignTypes} userId={user.id} />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <HomeTabs 
          gangs={gangs} 
          campaigns={campaigns} 
          campaignTypes={campaignTypes}
          userId={user.id}
        />
      </div>
    </main>
  )
}
