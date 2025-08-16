import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { SupabaseClient } from "@supabase/supabase-js";
import { cache } from 'react';
import { getAuthenticatedUser } from '@/utils/auth';

export type Gang = {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  image_url: string;
  gang_type_image_url: string;
  credits: number;
  reputation: number;
  meat: number;
  exploration_points: number;
  rating: number;
  created_at: string;
  last_updated: string;
  gang_variants: Array<{id: string, variant: string}>;
  campaigns: Array<{campaign_id: string, campaign_name: string}>;
};

// Type for raw gang data from Supabase with nested gang_types
type RawGangData = {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  credits: number;
  reputation: number;
  meat: number;
  exploration_points: number;
  created_at: string;
  last_updated: string;
  gang_types: {
    image_url: string;
  };
};

type Fighter = {
  id: string;
  credits: number;
  cost_adjustment: number;
  fighter_equipment?: Array<{ purchase_cost: number }>;
  fighter_skills?: Array<{ credits_increase: number }>;
  fighter_effects?: Array<{ type_specific_data: { credits_increase?: number } }>;
  vehicles?: Array<{
    id: string;
    cost: number;
    fighter_equipment?: Array<{ purchase_cost: number }>;
    fighter_effects?: Array<{ type_specific_data: { credits_increase?: number } }>;
  }>;
};

type FighterWithRating = {
  id: string;
  rating: number;
};

// Use React's cache for Server Component memoization
export const getUserGangs = cache(async function fetchUserGangs(): Promise<Gang[]> {
  console.log("Server: Fetching user gangs");
  try {
    const supabase = await createClient();
    
    const user = await getAuthenticatedUser(supabase);

    // Fetch gangs with rating column
    const { data, error: gangsError } = await supabase
      .from('gangs')
      .select(`
        id,
        name,
        gang_type,
        gang_type_id,
        image_url,
        credits,
        reputation,
        meat,
        exploration_points,
        rating,
        created_at,
        last_updated,
        gang_variants,
        gang_types!gang_type_id(image_url)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (gangsError) {
      console.error('Error fetching gangs:', gangsError);
      throw gangsError;
    }

    if (!data || data.length === 0) {
      console.log("Server: No gangs found");
      return [];
    }

    console.log(`Server: Found ${data.length} gangs`);

    // Fetch gang variants details for all gangs that have variants
    const gangsWithVariants = await Promise.all(data.map(async (gang: any) => {
      let variantDetails: Array<{id: string, variant: string}> = [];
      
      if (gang.gang_variants && Array.isArray(gang.gang_variants) && gang.gang_variants.length > 0) {
        try {
          const { data: variants, error: variantsError } = await supabase
            .from('gang_variant_types')
            .select('id, variant')
            .in('id', gang.gang_variants);
          
          if (!variantsError && variants) {
            variantDetails = variants.map((v: any) => ({
              id: v.id,
              variant: v.variant
            }));
          }
        } catch (variantError) {
          console.error(`Error fetching variants for gang ${gang.id}:`, variantError);
        }
      }
      
      return {
        ...gang,
        gang_variants: variantDetails
      };
    }));

    // Fetch campaign details for all gangs
    const gangsWithCampaigns = await Promise.all(gangsWithVariants.map(async (gang: any) => {
      let campaignDetails: Array<{campaign_id: string, campaign_name: string}> = [];
      
      try {
        const { data: campaignGangs, error: campaignError } = await supabase
          .from('campaign_gangs')
          .select(`
            campaign_id,
            campaigns!campaign_id(campaign_name)
          `)
          .eq('gang_id', gang.id);
        
        if (!campaignError && campaignGangs) {
          campaignDetails = campaignGangs.map((cg: any) => ({
            campaign_id: cg.campaign_id,
            campaign_name: cg.campaigns?.campaign_name || 'Unknown Campaign'
          }));
        }
      } catch (campaignError) {
        console.error(`Error fetching campaigns for gang ${gang.id}:`, campaignError);
      }
      
      return {
        ...gang,
        campaigns: campaignDetails
      };
    }));

    // Map final shape using stored rating
    const gangsWithRatings: Gang[] = gangsWithCampaigns.map((gang: any) => ({
      id: gang.id,
      name: gang.name,
      gang_type: gang.gang_type,
      gang_type_id: gang.gang_type_id,
      image_url: gang.image_url || '',
      gang_type_image_url: gang.gang_types?.image_url || '',
      credits: gang.credits,
      reputation: gang.reputation,
      meat: gang.meat,
      exploration_points: gang.exploration_points,
      rating: gang.rating || 0,
      created_at: gang.created_at,
      last_updated: gang.last_updated,
      gang_variants: gang.gang_variants,
      campaigns: gang.campaigns
    }));

    console.log(`Server: Processed ${gangsWithRatings.length} gangs with ratings`);
    return gangsWithRatings;
  } catch (error) {
    console.error('Unexpected error in getUserGangs:', error);
    
    // Log to error reporting service
    if (process.env.NODE_ENV === 'production') {
      // captureException(error) // Using your error reporting service
    }
    
    return [];
  }
}); 