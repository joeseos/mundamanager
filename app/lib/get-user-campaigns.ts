import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import { campaignMembers } from '@/utils/db/schema';

export type Campaign = {
  id: string;
  campaign_member_id: string;
  campaign_name: string | null;
  campaign_type: string;
  campaign_type_id: string | null;
  created_at: string;
  updated_at: string | null;
  role?: string;
  image_url: string;
  campaign_type_image_url: string;
  user_gangs?: { id: string; name: string | null }[];
  is_favourite: boolean;
  favourite_order: number | null;
  /** Derived from campaign_types; null treated as n23 by home filters. */
  edition_slug: string | null;
};

export const getUserCampaigns = async (userId: string): Promise<Campaign[]> => {
  return unstable_cache(
    async () => {
      const members = await getAppDb().query.campaignMembers.findMany({
        columns: { id: true, role: true, is_favourite: true, favourite_order: true },
        where: (member, { eq }) => eq(member.user_id, userId),
        with: {
          campaign: {
            columns: { id: true, campaign_name: true, campaign_type_id: true, image_url: true, created_at: true, updated_at: true },
            with: {
              campaign_type: {
                columns: { campaign_type_name: true, image_url: true },
                with: { editions: { columns: { slug: true } } },
              },
              campaign_gangs: {
                columns: {},
                where: (campaignGang, { eq }) => eq(campaignGang.user_id, userId),
                with: { gang: { columns: { id: true, name: true } } },
              },
            },
          },
        },
      });

      // A user can hold more than one membership in a campaign; the first one wins
      const campaigns = new Map<string, Campaign>();
      for (const { campaign, ...member } of members) {
        if (!campaign || campaigns.has(campaign.id)) continue;
        const { campaign_type } = campaign;
        campaigns.set(campaign.id, {
          id: campaign.id,
          campaign_member_id: member.id,
          campaign_name: campaign.campaign_name,
          campaign_type: campaign_type?.campaign_type_name || '',
          campaign_type_id: campaign.campaign_type_id,
          created_at: campaign.created_at,
          updated_at: campaign.updated_at,
          role: member.role || '',
          image_url: campaign.image_url || '',
          campaign_type_image_url: campaign_type?.image_url || '',
          is_favourite: member.is_favourite,
          favourite_order: member.favourite_order,
          edition_slug: campaign_type?.editions?.slug ?? null,
          user_gangs: campaign.campaign_gangs.flatMap(({ gang }) => (gang ? [gang] : [])),
        });
      }

      return [...campaigns.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
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
  userId: string
): Promise<Array<{ id: string; campaign_name: string | null; status: string | null; edition_slug: string | null }>> => {
  return unstable_cache(
    async () => {
      const db = getAppDb();
      const campaigns = await db.query.campaigns.findMany({
        columns: { id: true, campaign_name: true, status: true },
        where: (campaign) =>
          inArray(
            campaign.id,
            db
              .select({ id: campaignMembers.campaign_id })
              .from(campaignMembers)
              .where(and(eq(campaignMembers.user_id, userId), inArray(campaignMembers.role, ['OWNER', 'ARBITRATOR'])))
          ),
        orderBy: (campaign, { asc }) => [asc(campaign.campaign_name), asc(campaign.id)],
        with: { campaign_type: { columns: {}, with: { editions: { columns: { slug: true } } } } },
      });

      return campaigns.map(({ campaign_type, ...campaign }) => ({
        ...campaign,
        edition_slug: campaign_type?.editions?.slug ?? null,
      }));
    },
    [`user-share-campaigns-v3-${userId}`],
    {
      tags: [TAGS.user(userId)],
      revalidate: false
    }
  )();
};
