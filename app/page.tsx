// This page uses server components with ISR caching for optimal performance
// Server actions should trigger revalidation of this data using revalidatePath

import { createClient } from "@/utils/supabase/server";
import { CreateGangButton } from '@/components/create-gang-modal';
import { CreateCampaignButton } from '@/components/create-campaign';
import { getUserGangs } from '@/app/lib/get-user-gangs';
import { getUserCampaigns, getUserShareCampaigns } from '@/app/lib/get-user-campaigns';
import { FaDiscord, FaPatreon } from "react-icons/fa6";
import HomeTabs from '@/components/home-tabs';
import { getAuthenticatedUser, signInPath } from '@/utils/auth';
import { getCampaignTypes } from '@/app/lib/campaigns/[id]/get-campaign-data';
import { getTradingPostTypesCached } from '@/app/lib/reference-data';
import { GrHelpBook } from "react-icons/gr";
import { Button } from '@/components/ui/button';
import { PwaInstallButton } from '@/components/pwa-install-button';
import { getUserCustomEquipment } from "@/app/lib/customise/custom-equipment";
import { getUserCustomFighterTypes } from "@/app/lib/customise/custom-fighters";
import { getUserCustomSkills } from "@/app/lib/customise/custom-skills";
import { getUserCustomGangTypes } from "@/app/lib/customise/custom-gang-types";
import { getUserCustomTradingPosts } from "@/app/lib/customise/custom-trading-posts";
import { getUserCustomCollections } from "@/app/lib/customise/custom-collections";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();
  
  let user;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch (error) {
    redirect(signInPath("/"));
  }

  // Single invocation that gets gangs, campaigns, and customise data
  const [
    gangs,
    campaigns,
    customEquipment,
    customFighterTypes,
    customSkills,
    customGangTypes,
    customTradingPosts,
    customCollections
  ] = await Promise.all([
    getUserGangs(user.id, supabase),
    getUserCampaigns(user.id, supabase),
    getUserCustomEquipment(user.id, supabase),
    getUserCustomFighterTypes(user.id, supabase),
    getUserCustomSkills(user.id, supabase),
    getUserCustomGangTypes(user.id, supabase),
    getUserCustomTradingPosts(user.id, supabase),
    getUserCustomCollections(user.id, supabase)
  ]);
  
  // Reference data for the create-campaign modal and the user's share-modal
  // campaigns — all cached (campaign-types / global / user-{id} tags).
  const [campaignTypes, tradingPostTypes, userCampaigns] = await Promise.all([
    getCampaignTypes(),
    getTradingPostTypesCached(supabase),
    getUserShareCampaigns(user.id, supabase)
  ]);

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
          customFighterTypes={customFighterTypes}
          customSkills={customSkills}
          customGangTypes={customGangTypes}
          customTradingPosts={customTradingPosts}
          customCollections={customCollections}
          userCampaigns={userCampaigns}
        />
      </div>
    </main>
  )
}
