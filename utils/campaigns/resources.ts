import type { SupabaseClient } from '@supabase/supabase-js';

export interface CampaignResource {
  id: string;
  resource_name: string;
  is_custom: boolean;
}

/**
 * Core logic for fetching campaign resources.
 * Fetches both predefined campaign type resources (if applicable) and custom campaign resources.
 * 
 * @param campaignId - The campaign ID
 * @param supabase - Supabase client instance
 * @returns Array of resources with their metadata
 * @throws Error if campaign is not found or database query fails
 */
export async function fetchCampaignResources(
  campaignId: string,
  supabase: SupabaseClient
): Promise<CampaignResource[]> {
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

  let resources: CampaignResource[] = [];

  // Always fetch predefined campaign type resources (if not custom campaign)
  if (!isCustomCampaign) {
    const { data: typeResources, error: typeResourceError } = await supabase
      .from('campaign_type_resources')
      .select('id, resource_name')
      .eq('campaign_type_id', campaign.campaign_type_id)
      .order('resource_name', { ascending: true });

    if (typeResourceError) {
      throw typeResourceError;
    }

    resources = (typeResources || []).map(r => ({
      id: r.id,
      resource_name: r.resource_name,
      is_custom: false
    }));
  }

  // Always fetch custom campaign resources (for all campaign types)
  const { data: customResources, error: customError } = await supabase
    .from('campaign_resources')
    .select('id, resource_name')
    .eq('campaign_id', campaignId)
    .order('resource_name', { ascending: true });

  if (customError) {
    throw customError;
  }

  // Add custom resources to the list
  const customResourcesList = (customResources || []).map(r => ({
    id: r.id,
    resource_name: r.resource_name,
    is_custom: true
  }));

  return [...resources, ...customResourcesList];
}
