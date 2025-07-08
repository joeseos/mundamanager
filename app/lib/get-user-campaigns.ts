import { createClient } from "@/utils/supabase/server";
import { cache } from 'react';

export type Campaign = {
  id: string;
  campaign_member_id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_type_id: string;
  created_at: string;
  updated_at: string;
  role?: string;
  status?: string;
  image_url: string;
  user_gangs?: { id: string; name: string }[];
};

// Use React's cache for Server Component memoization
export const getUserCampaigns = cache(async function fetchUserCampaigns(): Promise<Campaign[]> {
  console.log("Server: Fetching user campaigns");
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    // First get campaign members for this user
    const { data: campaignMembers, error: membersError } = await supabase
      .from('campaign_members')
      .select('id, campaign_id, role, status')
      .eq('user_id', user.id);

    if (membersError) {
      console.error('Error fetching campaign members:', membersError);
      throw membersError;
    }

    if (!campaignMembers || campaignMembers.length === 0) {
      console.log("Server: No campaign memberships found");
      return [];
    }

    // Get campaign IDs
    const campaignIds = campaignMembers.map(member => member.campaign_id);

    // Get campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, campaign_name, campaign_type_id, created_at, updated_at, image_url')
      .in('id', campaignIds);

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError);
      throw campaignsError;
    }

    if (!campaigns || campaigns.length === 0) {
      console.log("Server: No campaigns found");
      return [];
    }

    // Get campaign types
    const campaignTypeIds = Array.from(new Set(campaigns.map(c => c.campaign_type_id)));
    const { data: campaignTypes, error: typesError } = await supabase
      .from('campaign_types')
      .select('id, campaign_type_name')
      .in('id', campaignTypeIds);

    if (typesError) {
      console.error('Error fetching campaign types:', typesError);
      throw typesError;
    }

    console.log(`Server: Found ${campaigns.length} campaigns`);

    // Manually join the data like the SQL function does
    const campaignsWithDetails = campaigns.map((campaign: any) => {
      const memberData = campaignMembers.find(member => member.campaign_id === campaign.id);
      const typeData = campaignTypes?.find(type => type.id === campaign.campaign_type_id);
      
      return {
        id: campaign.id,
        campaign_member_id: memberData?.id || '',
        campaign_name: campaign.campaign_name,
        campaign_type: typeData?.campaign_type_name || '',
        campaign_type_id: campaign.campaign_type_id,
        created_at: campaign.created_at,
        updated_at: campaign.updated_at,
        role: memberData?.role || '',
        status: memberData?.status || '',
        image_url: campaign.image_url || ''
      };
    }) as Campaign[];

    // For each campaign, fetch the user's gangs participating in that campaign
    const userGangsByCampaign: Record<string, { id: string; name: string }[]> = {};
    for (const campaign of campaignsWithDetails) {
      const { data: campaignGangs, error: campaignGangsError } = await supabase
        .from('campaign_gangs')
        .select('gang_id')
        .eq('campaign_id', campaign.id)
        .eq('user_id', user.id);

      if (campaignGangsError) {
        console.error('Error fetching campaign gangs:', campaignGangsError);
        userGangsByCampaign[campaign.id] = [];
        continue;
      }

      const gangIds = campaignGangs.map(g => g.gang_id);
      let gangs: { id: string; name: string }[] = [];
      if (gangIds.length > 0) {
        const { data: gangDetails, error: gangDetailsError } = await supabase
          .from('gangs')
          .select('id, name')
          .in('id', gangIds);

        if (!gangDetailsError && gangDetails) {
          gangs = gangDetails;
        }
      }
      userGangsByCampaign[campaign.id] = gangs;
    }

    // Attach user_gangs to each campaign
    const campaignsWithGangs = campaignsWithDetails.map(campaign => ({
      ...campaign,
      user_gangs: userGangsByCampaign[campaign.id] || []
    }));

    // Sort by created_at desc like the SQL function
    const sortedCampaigns = campaignsWithGangs.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    console.log(`Server: Processed ${sortedCampaigns.length} campaigns`);
    return sortedCampaigns;
  } catch (error) {
    console.error('Unexpected error in getUserCampaigns:', error);
    
    // Log to error reporting service
    if (process.env.NODE_ENV === 'production') {
      // captureException(error) // Using your error reporting service
    }
    
    return [];
  }
}); 