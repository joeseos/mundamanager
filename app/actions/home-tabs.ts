'use server';

// Server actions that lazily load the Campaigns and Custom Assets tab data for the
// home page. The Gangs tab is server-rendered in app/page.tsx; these actions defer
// the heavier, less-visited tabs until the user first opens them. Each underlying
// lib fetcher is wrapped in unstable_cache, so repeat calls stay cheap.

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { getUserCampaigns, type Campaign } from '@/app/lib/get-user-campaigns';
import { getUserCustomEquipment, type CustomEquipment } from '@/app/lib/customise/custom-equipment';
import { getUserCustomFighterTypes } from '@/app/lib/customise/custom-fighters';
import { getUserCustomSkills, type CustomSkill } from '@/app/lib/customise/custom-skills';
import { getUserCustomGangTypes } from '@/app/lib/customise/custom-gang-types';
import { getUserCustomTradingPosts } from '@/app/lib/customise/custom-trading-posts';
import { getUserCustomCollections, type CustomCollectionWithItems } from '@/app/lib/customise/custom-collections';
import type { CustomFighterType } from '@/types/fighter';
import type { CustomGangType } from '@/app/actions/customise/custom-gang-types';
import type { CustomTradingPost } from '@/app/actions/customise/custom-trading-posts';
import type { UserCampaign } from '@/types/campaign';

export interface CustomAssetsData {
  customEquipment: CustomEquipment[];
  customFighterTypes: CustomFighterType[];
  customSkills: CustomSkill[];
  customGangTypes: CustomGangType[];
  customTradingPosts: CustomTradingPost[];
  customCollections: CustomCollectionWithItems[];
  userCampaigns: UserCampaign[];
}

export async function loadCampaignsTab(): Promise<Campaign[]> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  return getUserCampaigns(user.id, supabase);
}

export async function loadCustomAssetsTab(): Promise<CustomAssetsData> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const [
    customEquipment,
    customFighterTypes,
    customSkills,
    customGangTypes,
    customTradingPosts,
    customCollections,
    userCampaigns,
  ] = await Promise.all([
    getUserCustomEquipment(user.id, supabase),
    getUserCustomFighterTypes(user.id, supabase),
    getUserCustomSkills(user.id, supabase),
    getUserCustomGangTypes(user.id, supabase),
    getUserCustomTradingPosts(user.id, supabase),
    getUserCustomCollections(user.id, supabase),
    getArbitratedCampaigns(user.id, supabase),
  ]);

  return {
    customEquipment,
    customFighterTypes,
    customSkills,
    customGangTypes,
    customTradingPosts,
    customCollections,
    userCampaigns,
  };
}

// Campaigns the user owns or arbitrates — used to gate the "Share to campaign" action
// on each custom asset.
async function getArbitratedCampaigns(
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<UserCampaign[]> {
  const { data: campaignMembers } = await supabase
    .from('campaign_members')
    .select('campaign_id')
    .eq('user_id', userId)
    .in('role', ['OWNER', 'ARBITRATOR']);

  const campaignIds = campaignMembers?.map(cm => cm.campaign_id) || [];
  if (campaignIds.length === 0) return [];

  const { data: campaignsForShare } = await supabase
    .from('campaigns')
    .select('id, campaign_name, status')
    .in('id', campaignIds)
    .order('campaign_name');

  return campaignsForShare || [];
}
