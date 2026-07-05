import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

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
  campaign_type_image_url: string;
  user_gangs?: { id: string; name: string }[];
  is_favourite: boolean;
  favourite_order: number | null;
};

export const getUserCampaigns = async (userId: string, supabase: any): Promise<Campaign[]> => {
  return unstable_cache(
    async () => {
      console.log("Server: Fetching user campaigns");
      try {
        const { data: campaignMembers, error: membersError } = await supabase
          .from('campaign_members')
          .select('id, campaign_id, role, status, is_favourite, favourite_order')
          .eq('user_id', userId);

        if (membersError) {
          console.error('Error fetching campaign members:', membersError);
          throw membersError;
        }

        if (!campaignMembers || campaignMembers.length === 0) {
          console.log("Server: No campaign memberships found");
          return [];
        }

        const campaignIds = campaignMembers.map((member: any) => member.campaign_id);

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

        const campaignTypeIds = Array.from(new Set(campaigns.map((c: any) => c.campaign_type_id)));
        const { data: campaignTypes, error: typesError } = await supabase
          .from('campaign_types')
          .select('id, campaign_type_name, image_url')
          .in('id', campaignTypeIds);

        if (typesError) {
          console.error('Error fetching campaign types:', typesError);
          throw typesError;
        }

        console.log(`Server: Found ${campaigns.length} campaigns`);

        const campaignsWithDetails = campaigns.map((campaign: any) => {
          const memberData = campaignMembers.find((member: any) => member.campaign_id === campaign.id);
          const typeData = campaignTypes?.find((type: any) => type.id === campaign.campaign_type_id);

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
            image_url: campaign.image_url || '',
            campaign_type_image_url: typeData?.image_url || '',
            is_favourite: memberData?.is_favourite ?? false,
            favourite_order: memberData?.favourite_order ?? null,
          };
        }) as Campaign[];

        const userGangsByCampaign: Record<string, { id: string; name: string }[]> = {};
        for (const campaign of campaignsWithDetails) {
          const { data: campaignGangs, error: campaignGangsError } = await supabase
            .from('campaign_gangs')
            .select('gang_id')
            .eq('campaign_id', campaign.id)
            .eq('user_id', userId);

          if (campaignGangsError) {
            console.error('Error fetching campaign gangs:', campaignGangsError);
            userGangsByCampaign[campaign.id] = [];
            continue;
          }

          const gangIds = campaignGangs.map((g: any) => g.gang_id);
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

        const campaignsWithGangs = campaignsWithDetails.map(campaign => ({
          ...campaign,
          user_gangs: userGangsByCampaign[campaign.id] || []
        }));

        const sortedCampaigns = campaignsWithGangs.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        console.log(`Server: Processed ${sortedCampaigns.length} campaigns`);
        return sortedCampaigns;
      } catch (error) {
        console.error('Unexpected error in getUserCampaigns:', error);

        if (process.env.NODE_ENV === 'production') {
          // captureException(error)
        }

        return [];
      }
    },
    [`user-campaigns-${userId}`],
    {
      tags: [CACHE_TAGS.USER_CAMPAIGNS(userId)],
      revalidate: false
    }
  )();
};
