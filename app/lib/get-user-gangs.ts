import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { DefaultImageEntry, normaliseDefaultImageUrls } from '@/types/gang';

export type Gang = {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  image_url: string;
  gang_type_image_url: string;
  default_gang_image?: number | null;
  gang_type_default_image_urls?: DefaultImageEntry[];
  credits: number;
  reputation: number;
  rating: number;
  created_at: string;
  last_updated: string;
  gang_variants: Array<{id: string, variant: string}>;
  campaigns: Array<{campaign_id: string, campaign_name: string}>;
  is_favourite: boolean;
  favourite_order: number | null;
};

/**
 * Cached list of the user's gang ids, so the list entry below can carry
 * per-gang tags (dynamic tags must be known before the cached call).
 * Busted via user-{id} whenever the list shape changes (create/delete/copy).
 */
const getUserGangIdsCached = async (userId: string, supabase: any): Promise<string[]> => {
  return unstable_cache(
    async () => {
      const { data } = await supabase
        .from('gangs')
        .select('id')
        .eq('user_id', userId);
      return (data || []).map((g: any) => g.id);
    },
    [`user-gang-ids-v2-${userId}`],
    {
      tags: [TAGS.user(userId)],
      revalidate: false
    }
  )();
};

export const getUserGangs = async (userId: string, supabase: any): Promise<Gang[]> => {
  const gangIdsForTags = await getUserGangIdsCached(userId, supabase);

  return unstable_cache(
    async () => {
      try {
        const { data, error: gangsError } = await supabase
          .from('gangs')
          .select(`
            id,
            name,
            gang_type,
            gang_type_id,
            custom_gang_type_id,
            image_url,
            default_gang_image,
            credits,
            reputation,
            rating,
            created_at,
            last_updated,
            gang_variants,
            is_favourite,
            favourite_order,
            gang_types!gang_type_id(image_url, default_image_urls),
            custom_gang_types!custom_gang_type_id(default_image_urls)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (gangsError) {
          console.error('Error fetching gangs:', gangsError);
          throw gangsError;
        }

        if (!data || data.length === 0) {
          return [];
        }

        // Batch the per-gang lookups (previously one variants query and one
        // campaigns query PER GANG) into two .in() queries.
        const gangIds = data.map((g: any) => g.id);
        const allVariantIds = Array.from(new Set(
          data.flatMap((g: any) => (Array.isArray(g.gang_variants) ? g.gang_variants : []))
        ));

        const [variantsRes, campaignGangsRes] = await Promise.all([
          allVariantIds.length > 0
            ? supabase
                .from('gang_variant_types')
                .select('id, variant')
                .in('id', allVariantIds)
            : Promise.resolve({ data: [] }),
          supabase
            .from('campaign_gangs')
            .select(`
              gang_id,
              campaign_id,
              campaigns!campaign_id(campaign_name)
            `)
            .in('gang_id', gangIds)
        ]);

        const variantById = new Map<string, { id: string; variant: string }>();
        (variantsRes.data || []).forEach((v: any) => {
          variantById.set(v.id, { id: v.id, variant: v.variant });
        });

        const campaignsByGang = new Map<string, Array<{ campaign_id: string; campaign_name: string }>>();
        (campaignGangsRes.data || []).forEach((cg: any) => {
          if (!campaignsByGang.has(cg.gang_id)) campaignsByGang.set(cg.gang_id, []);
          campaignsByGang.get(cg.gang_id)!.push({
            campaign_id: cg.campaign_id,
            campaign_name: cg.campaigns?.campaign_name || 'Unknown Campaign'
          });
        });

        return data.map((gang: any) => ({
          id: gang.id,
          name: gang.name,
          gang_type: gang.gang_type,
          gang_type_id: gang.gang_type_id,
          image_url: gang.image_url || '',
          gang_type_image_url: gang.gang_types?.image_url || '',
          default_gang_image: gang.default_gang_image ?? null,
          gang_type_default_image_urls: normaliseDefaultImageUrls(gang.gang_types?.default_image_urls ?? gang.custom_gang_types?.default_image_urls),
          credits: gang.credits,
          reputation: gang.reputation,
          rating: gang.rating || 0,
          created_at: gang.created_at,
          last_updated: gang.last_updated,
          gang_variants: (Array.isArray(gang.gang_variants) ? gang.gang_variants : [])
            .map((id: string) => variantById.get(id))
            .filter(Boolean) as Array<{ id: string; variant: string }>,
          campaigns: campaignsByGang.get(gang.id) || [],
          is_favourite: gang.is_favourite ?? false,
          favourite_order: gang.favourite_order ?? null,
        }));
      } catch (error) {
        console.error('Unexpected error in getUserGangs:', error);
        return [];
      }
    },
    [`user-gangs-v2-${userId}`],
    {
      tags: [
        // List shape (create/delete/copy gang, favourites)
        TAGS.user(userId),
        // Card fields: rating/credits/name via the financials choke point
        ...gangIdsForTags.map(id => TAGS.gangOverview(id)),
        // Campaign names on cards: join/leave (previously never invalidated)
        ...gangIdsForTags.map(id => TAGS.gangCampaigns(id))
      ],
      revalidate: false
    }
  )();
};
