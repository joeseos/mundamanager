// This page uses server components with ISR caching for optimal performance
// Server actions should trigger revalidation of this data using revalidatePath

import { createClient } from "@/utils/supabase/server";
import { CreateGangButton } from '@/components/create-gang-modal';
import { CreateCampaignButton } from '@/components/create-campaign';
import { getUserGangs } from '@/app/lib/get-user-gangs';
import { getUserCampaigns } from '@/app/lib/get-user-campaigns';
import { FaDiscord, FaPatreon } from "react-icons/fa6";
import HomeTabs from '@/components/home-tabs';
import { getAuthenticatedUser } from '@/utils/auth';
import { GrHelpBook } from "react-icons/gr";
import { Button } from '@/components/ui/button';
import { PwaInstallButton } from '@/components/pwa-install-button';
import { getUserCustomEquipment } from "@/app/lib/customise/custom-equipment";
import { getUserCustomTerritories } from "@/app/lib/customise/custom-territories";
import { getUserCustomFighterTypes } from "@/app/lib/customise/custom-fighters";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();
  
  let user;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch (error) {
    redirect("/sign-in");
  }

  // Single invocation that gets gangs, campaigns, and customise data
  const [
    gangs,
    campaigns,
    customEquipment,
    customTerritories,
    customFighterTypes
  ] = await Promise.all([
    getUserGangs(),
    getUserCampaigns(),
    getUserCustomEquipment(user.id),
    getUserCustomTerritories(),
    getUserCustomFighterTypes(user.id)
  ]);
  
  // Fetch campaign types and trading post types for the create campaign modal
  const [campaignTypesResult, tradingPostTypesResult] = await Promise.all([
    supabase
      .from('campaign_types')
      .select('id, campaign_type_name, trading_posts'),
    supabase
      .from('trading_post_types')
      .select('id, trading_post_name')
      .order('trading_post_name')
  ]);

  const campaignTypes = campaignTypesResult.data;
  const tradingPostTypes = tradingPostTypesResult.data;

  // Fetch user's campaigns for sharing (where user is owner or arbitrator)
  const { data: campaignMembers } = await supabase
    .from('campaign_members')
    .select('campaign_id')
    .eq('user_id', user.id)
    .in('role', ['OWNER', 'ARBITRATOR']);

  const campaignIds = campaignMembers?.map(cm => cm.campaign_id) || [];

  let userCampaigns: Array<{ id: string; campaign_name: string; status: string | null }> = [];
  if (campaignIds.length > 0) {
    const { data: campaignsForShare } = await supabase
      .from('campaigns')
      .select('id, campaign_name, status')
      .in('id', campaignIds)
      .order('campaign_name');

    userCampaigns = campaignsForShare || [];
  }

  if (campaignTypesResult.error) {
    console.error('Error fetching campaign types:', campaignTypesResult.error);
  }
  if (tradingPostTypesResult.error) {
    console.error('Error fetching trading post types:', tradingPostTypesResult.error);
  }

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4 md:p-4">
          <div className="mb-0">
            <h1 className="text-xl md:text-2xl font-bold mb-2">Welcome to Munda Manager</h1>
            <p className="text-muted-foreground mb-4">
              Join our Discord to chat or get help with Necromunda and Munda Manager.
            </p>
            <div>
              <div className="flex gap-1 justify-center">
                <Link href="/user-guide" prefetch={false} className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted w-full whitespace-nowrap">
                  <GrHelpBook className="mr-1 size-4" />
                  <span className="sm:hidden">Guide</span>
                  <span className="hidden sm:inline">User Guide</span>
                </Link>
                <a href="https://discord.gg/ZWXXqd5NUt" target="_blank" rel="noopener noreferrer" className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted w-full">
                  <FaDiscord className="mr-1 size-4" />
                  Discord
                </a>
                <a href="https://www.patreon.com/c/mundamanager" target="_blank" rel="noopener noreferrer" className="flex justify-center items-center px-2 py-1 text-sm rounded-md hover:bg-muted w-full">
                  <FaPatreon className="mr-1 size-4" />
                  Patreon
                </a>
                <PwaInstallButton />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex flex-wrap gap-1">
                <div className="flex-1 min-w-[135px] sm:w-auto w-full">
                  <CreateGangButton />
                </div>
                <div className="flex-1 min-w-[135px] sm:w-auto w-full">
                  <CreateCampaignButton initialCampaignTypes={campaignTypes} initialTradingPostTypes={tradingPostTypes} userId={user.id} />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <HomeTabs 
          gangs={gangs} 
          campaigns={campaigns} 
          userId={user.id}
          customEquipment={customEquipment}
          customTerritories={customTerritories}
          customFighterTypes={customFighterTypes}
          userCampaigns={userCampaigns}
        />
      </div>
    </main>
  )
}
