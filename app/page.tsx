// Server actions invalidate this data with revalidateTag via the helpers in
// utils/cache-tags.ts - not revalidatePath, which evicts every cached entry.

import { createClient } from "@/utils/supabase/server";
import { getUserGangs } from '@/app/lib/get-user-gangs';
import { getUserCampaigns, getUserShareCampaigns } from '@/app/lib/get-user-campaigns';
import HomeTabs from '@/components/home-tabs';
import { getAuthenticatedUser, signInPath } from '@/utils/auth';
import { getCampaignTypes, getTradingPostTypesCached } from '@/app/lib/reference-data';
import { getUserCustomEquipment } from "@/app/lib/customise/custom-equipment";
import { getUserCustomFighterTypes } from "@/app/lib/customise/custom-fighters";
import { getUserCustomSkills } from "@/app/lib/customise/custom-skills";
import { getUserCustomGangTypes } from "@/app/lib/customise/custom-gang-types";
import { getUserCustomTradingPosts } from "@/app/lib/customise/custom-trading-posts";
import { getUserCustomCollections } from "@/app/lib/customise/custom-collections";
import { redirect } from "next/navigation";
import { editionSlugFromJoin, withEditionSlug } from "@/types/edition";
import type { UserCampaign } from "@/types/campaign";

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
    getUserGangs(user.id),
    getUserCampaigns(user.id),
    getUserCustomEquipment(user.id),
    getUserCustomFighterTypes(user.id),
    getUserCustomSkills(user.id),
    getUserCustomGangTypes(user.id),
    getUserCustomTradingPosts(user.id),
    getUserCustomCollections(user.id)
  ]);
  
  // Reference data for the create-campaign modal and the user's share-modal
  // campaigns — all cached (campaign-types / global / user-{id} tags).
  const [campaignTypes, tradingPostTypes, userCampaigns] = await Promise.all([
    getCampaignTypes(),
    getTradingPostTypesCached(),
    getUserShareCampaigns(user.id)
  ]);

  return (
    <main className="flex min-h-screen flex-col items-center">
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
        campaignTypes={campaignTypes}
        tradingPostTypes={tradingPostTypes}
      />
    </main>
  )
}
