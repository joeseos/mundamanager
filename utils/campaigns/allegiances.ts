import type { SupabaseClient } from '@supabase/supabase-js';

export interface CampaignAllegiance {
  id: string;
  allegiance_name: string;
  is_custom: boolean;
}

/**
 * Core logic for fetching campaign allegiances.
 * Fetches both predefined campaign type allegiances (if applicable) and custom campaign allegiances.
 * 
 * @param campaignId - The campaign ID
 * @param supabase - Supabase client instance
 * @returns Array of allegiances with their metadata
 * @throws Error if campaign is not found or database query fails
 */
export async function fetchCampaignAllegiances(
  campaignId: string,
  supabase: SupabaseClient
): Promise<CampaignAllegiance[]> {
  // First, get the campaign to determine its type
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('campaign_type_id')
    .eq('id', campaignId)
    .single();

  if (campaignError) {
    throw campaignError;
  }

  if (!campaign || !campaign.campaign_type_id) {
    throw new Error('Campaign not found');
  }

  // Get the campaign type to check if it's custom
  const { data: campaignType, error: typeError } = await supabase
    .from('campaign_types')
    .select('campaign_type_name')
    .eq('id', campaign.campaign_type_id)
    .single();

  if (typeError) {
    throw typeError;
  }

  const isCustomCampaign = campaignType?.campaign_type_name === 'Custom';

  let allegiances: CampaignAllegiance[] = [];

  // Always fetch predefined campaign type allegiances (if not custom campaign)
  if (!isCustomCampaign) {
    const { data: typeAllegiances, error: typeAllegianceError } = await supabase
      .from('campaign_type_allegiances')
      .select('id, allegiance_name')
      .eq('campaign_type_id', campaign.campaign_type_id)
      .order('allegiance_name', { ascending: true });

    if (typeAllegianceError) {
      throw typeAllegianceError;
    }

    allegiances = (typeAllegiances || []).map(a => ({
      id: a.id,
      allegiance_name: a.allegiance_name,
      is_custom: false
    }));
  }

  // Always fetch custom campaign allegiances (for all campaign types)
  const { data: customAllegiances, error: customError } = await supabase
    .from('campaign_allegiances')
    .select('id, allegiance_name')
    .eq('campaign_id', campaignId)
    .order('allegiance_name', { ascending: true });

  if (customError) {
    throw customError;
  }

  // Add custom allegiances to the list
  const customAllegiancesList = (customAllegiances || []).map(a => ({
    id: a.id,
    allegiance_name: a.allegiance_name,
    is_custom: true
  }));

  return [...allegiances, ...customAllegiancesList];
}

