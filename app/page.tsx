// This page uses server components with ISR caching for optimal performance
// Server actions should trigger revalidation of this data using revalidatePath

import { createClient } from "@/utils/supabase/server";
import { CreateGangButton } from '@/components/create-gang-modal';
import { CreateCampaignButton } from '@/components/create-campaign';
import { getUserGangs } from '@/app/lib/get-user-gangs';
import { FaDiscord, FaPatreon } from "react-icons/fa6";
import HomeTabs from '@/components/home-tabs';
import { getAuthenticatedUser, signInPath } from '@/utils/auth';
import { GrHelpBook } from "react-icons/gr";
import { PwaInstallButton } from '@/components/pwa-install-button';
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

  // Only the Gangs tab (the landing tab) is loaded upfront. Campaigns and Custom Assets
  // are fetched on demand when the user opens those tabs (see components/home-tabs.tsx).
  const gangs = await getUserGangs(user.id, supabase);

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
          userId={user.id}
        />
      </div>
    </main>
  )
}
