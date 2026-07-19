import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

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

        // Batch the user's gangs across all campaigns (previously two awaited
        // queries PER CAMPAIGN inside a for-loop) into two .in() queries.
        const userGangsByCampaign: Record<string, { id: string; name: string }[]> = {};
        const { data: allCampaignGangs, error: campaignGangsError } = await supabase
          .from('campaign_gangs')
          .select('campaign_id, gang_id')
          .in('campaign_id', campaignIds)
          .eq('user_id', userId);

        if (campaignGangsError) {
          console.error('Error fetching campaign gangs:', campaignGangsError);
        } else if (allCampaignGangs && allCampaignGangs.length > 0) {
          const allGangIds = Array.from(new Set(allCampaignGangs.map((g: any) => g.gang_id)));
          const { data: gangDetails, error: gangDetailsError } = await supabase
            .from('gangs')
            .select('id, name')
            .in('id', allGangIds);

          const gangById = new Map<string, { id: string; name: string }>();
          if (!gangDetailsError && gangDetails) {
            gangDetails.forEach((g: any) => gangById.set(g.id, g));
          }

          allCampaignGangs.forEach((cg: any) => {
            const gang = gangById.get(cg.gang_id);
            if (!gang) return;
            (userGangsByCampaign[cg.campaign_id] ||= []).push(gang);
          });
        }

        const campaignsWithGangs = campaignsWithDetails.map(campaign => ({
          ...campaign,
          user_gangs: userGangsByCampaign[campaign.id] || []
        }));

        const sortedCampaigns = campaignsWithGangs.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        return sortedCampaigns;
      } catch (error) {
        console.error('Unexpected error in getUserCampaigns:', error);

        if (process.env.NODE_ENV === 'production') {
          // captureException(error)
        }

        return [];
      }
    },
    [`user-campaigns-v2-${userId}`],
    {
      tags: [TAGS.user(userId)],
      revalidate: false
    }
  )();
};

/**
 * Campaigns where the user is OWNER/ARBITRATOR (custom-content share modal).
 * Cache: user-{id} — fired by membership/role mutations.
 */
export const getUserShareCampaigns = async (
  userId: string,
  supabase: any
): Promise<Array<{ id: string; campaign_name: string; status: string | null }>> => {
  return unstable_cache(
    async () => {
      const { data: campaignMembers } = await supabase
        .from('campaign_members')
        .select('campaign_id')
        .eq('user_id', userId)
        .in('role', ['OWNER', 'ARBITRATOR']);

      const campaignIds = (campaignMembers || []).map((cm: any) => cm.campaign_id);
      if (campaignIds.length === 0) return [];

      const { data: campaignsForShare } = await supabase
        .from('campaigns')
        .select('id, campaign_name, status')
        .in('id', campaignIds)
        .order('campaign_name');

      return campaignsForShare || [];
    },
    [`user-share-campaigns-v2-${userId}`],
    {
      tags: [TAGS.user(userId)],
      revalidate: false
    }
  )();
};
