import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { DefaultImageEntry, normaliseDefaultImageUrls } from '@/types/gang';
import { gangEditionSlug } from '@/types/edition';

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
  gang_subtypes: Array<{id: string, subtype: string}>;
  campaigns: Array<{campaign_id: string, campaign_name: string}>;
  is_favourite: boolean;
  favourite_order: number | null;
  /** Derived from official or custom gang type; null treated as n23 by home filters. */
  edition_slug: string | null;
};

/**
 * Cached list of the user's gang ids and types, so the list entry below can
 * carry per-gang and per-type tags (dynamic tags must be known before the
 * cached call). Busted via user-{id} whenever the list shape changes.
 */
const getUserGangIdsCached = async (
  userId: string,
  supabase: any
): Promise<Array<{ id: string; gang_type_id: string | null }>> => {
  return unstable_cache(
    async () => {
      const { data } = await supabase
        .from('gangs')
        .select('id, gang_type_id')
        .eq('user_id', userId);
      return (data || []).map((g: { id: string; gang_type_id: string | null }) => ({
        id: g.id,
        gang_type_id: g.gang_type_id,
      }));
    },
    [`user-gang-ids-v3-${userId}`],
    {
      tags: [TAGS.user(userId)],
      revalidate: false
    }
  )();
};

export const getUserGangs = async (userId: string, supabase: any): Promise<Gang[]> => {
  const gangsForTags = await getUserGangIdsCached(userId, supabase);
  const gangIdsForTags = gangsForTags.map((g) => g.id);
  const gangTypeIdsForTags = [...new Set(
    gangsForTags.map((g) => g.gang_type_id).filter((id): id is string => Boolean(id))
  )];

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
            gang_subtypes,
            is_favourite,
            favourite_order,
            gang_types!gang_type_id(
              image_url,
              default_image_urls,
              editions:edition_id (slug)
            ),
            custom_gang_types!custom_gang_type_id(
              default_image_urls,
              editions:edition_id (slug)
            )
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

        // Batch the per-gang lookups (previously one subtypes query and one
        // campaigns query PER GANG) into two .in() queries.
        const gangIds = data.map((g: any) => g.id);
        const allSubtypeIds = Array.from(new Set(
          data.flatMap((g: any) => (Array.isArray(g.gang_subtypes) ? g.gang_subtypes : []))
        ));

        const [subtypesRes, campaignGangsRes] = await Promise.all([
          allSubtypeIds.length > 0
            ? supabase
                .from('gang_subtype_types')
                .select('id, subtype')
                .in('id', allSubtypeIds)
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

        const subtypeById = new Map<string, { id: string; subtype: string }>();
        (subtypesRes.data || []).forEach((row: { id: string; subtype: string }) => {
          subtypeById.set(row.id, { id: row.id, subtype: row.subtype });
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
          gang_subtypes: (Array.isArray(gang.gang_subtypes) ? gang.gang_subtypes : [])
            .map((id: string) => subtypeById.get(id))
            .filter(Boolean) as Array<{ id: string; subtype: string }>,
          campaigns: campaignsByGang.get(gang.id) || [],
          is_favourite: gang.is_favourite ?? false,
          favourite_order: gang.favourite_order ?? null,
          edition_slug: gangEditionSlug(gang),
        }));
      } catch (error) {
        console.error('Unexpected error in getUserGangs:', error);

        if (process.env.NODE_ENV === 'production') {
          // captureException(error)
        }

        // Rethrow: unstable_cache would persist a returned [] with no TTL.
        throw error;
      }
    },
    [`user-gangs-v4-${userId}`],
    {
      tags: [
        // List shape (create/delete/copy gang, favourites)
        TAGS.user(userId),
        // Catalog portraits/names joined from gang_types (any type edit)
        TAGS.globalGangTypes(),
        // Same copies, scoped to a type so an Escher edit does not wait on
        // the global tag alone — admin gang-type writes fire this tag.
        ...gangTypeIdsForTags.map(id => TAGS.gangType(id)),
        // Card fields: rating/credits/name via the financials choke point
        ...gangIdsForTags.map(id => TAGS.gangOverview(id)),
        // Campaign names on cards: join/leave (previously never invalidated)
        ...gangIdsForTags.map(id => TAGS.gangCampaigns(id))
      ],
      revalidate: false
    }
  )();
};
