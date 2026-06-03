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

async function findGangResourceByName(
  supabase: SupabaseClient,
  campaignGangId: string,
  resourceName: string
) {
  const { data, error } = await supabase
    .from('campaign_gang_resources')
    .select(`
      id, quantity,
      campaign_type_resources!campaign_gang_resources_campaign_type_resource_id_fkey(resource_name),
      campaign_resources!campaign_gang_resources_campaign_resource_id_fkey(resource_name)
    `)
    .eq('campaign_gang_id', campaignGangId);

  if (error) throw new Error(`Failed to look up gang resources: ${error.message}`);

  return data?.find((r: any) => {
    const name = r.campaign_type_resources?.resource_name ?? r.campaign_resources?.resource_name;
    return name === resourceName;
  }) ?? null;
}

export async function deductGangResource(
  supabase: SupabaseClient,
  campaignGangId: string,
  resourceName: string,
  amount: number
): Promise<void> {
  const resource = await findGangResourceByName(supabase, campaignGangId, resourceName);

  if (!resource) {
    throw new Error(`Resource "${resourceName}" not found for this gang`);
  }
  if (resource.quantity < amount) {
    throw new Error(`Insufficient ${resourceName}. Required: ${amount}, Available: ${resource.quantity}`);
  }

  const { error } = await supabase
    .from('campaign_gang_resources')
    .update({ quantity: resource.quantity - amount })
    .eq('id', resource.id);

  if (error) throw new Error(`Failed to deduct resource: ${error.message}`);
}

export async function returnGangResource(
  supabase: SupabaseClient,
  gangId: string,
  resourceName: string,
  amount: number
): Promise<boolean> {
  const { data: campaignGang } = await supabase
    .from('campaign_gangs')
    .select('id')
    .eq('gang_id', gangId)
    .limit(1)
    .single();

  if (!campaignGang) return false;

  const resource = await findGangResourceByName(supabase, campaignGang.id, resourceName);
  if (!resource) return false;

  const { error } = await supabase
    .from('campaign_gang_resources')
    .update({ quantity: resource.quantity + amount })
    .eq('id', resource.id);

  if (error) {
    console.error('Failed to return resource:', error);
    return false;
  }
  return true;
}
