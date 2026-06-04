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

async function findGangResourceById(
  supabase: SupabaseClient,
  campaignGangId: string,
  campaignTypeResourceId?: string,
  campaignResourceId?: string
) {
  let query = supabase
    .from('campaign_gang_resources')
    .select('id, quantity')
    .eq('campaign_gang_id', campaignGangId);

  if (campaignTypeResourceId) {
    query = query.eq('campaign_type_resource_id', campaignTypeResourceId);
  } else if (campaignResourceId) {
    query = query.eq('campaign_resource_id', campaignResourceId);
  } else {
    throw new Error('Either campaignTypeResourceId or campaignResourceId is required');
  }

  const { data, error } = await query.single();
  if (error) throw new Error(`Failed to look up gang resource: ${error.message}`);
  return data ?? null;
}

export async function deductGangResource(
  supabase: SupabaseClient,
  campaignGangId: string,
  resourceName: string,
  amount: number,
  campaignTypeResourceId?: string,
  campaignResourceId?: string
): Promise<void> {
  if (amount <= 0) throw new Error('Resource amount must be greater than 0');

  const resource = await findGangResourceById(supabase, campaignGangId, campaignTypeResourceId, campaignResourceId);

  if (!resource) {
    throw new Error(`Resource "${resourceName}" not found for this gang`);
  }
  if (resource.quantity < amount) {
    throw new Error(`Insufficient ${resourceName}. Required: ${amount}, Available: ${resource.quantity}`);
  }

  const { data, error } = await supabase
    .from('campaign_gang_resources')
    .update({ quantity: resource.quantity - amount })
    .eq('id', resource.id)
    .gte('quantity', amount)
    .select('id');

  if (error) throw new Error(`Failed to deduct resource: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`Insufficient ${resourceName} (concurrent modification)`);
  }
}

export async function returnGangResource(
  supabase: SupabaseClient,
  gangId: string,
  resourceName: string,
  amount: number,
  campaignGangId?: string,
  campaignTypeResourceId?: string,
  campaignResourceId?: string
): Promise<void> {
  let resolvedCampaignGangId = campaignGangId;
  if (!resolvedCampaignGangId) {
    const { data: campaignGang } = await supabase
      .from('campaign_gangs')
      .select('id')
      .eq('gang_id', gangId)
      .limit(1)
      .single();

    if (!campaignGang) throw new Error(`Campaign gang not found for gang ${gangId}`);
    resolvedCampaignGangId = campaignGang.id;
  }

  const resource = await findGangResourceById(supabase, resolvedCampaignGangId!, campaignTypeResourceId, campaignResourceId);
  if (!resource) throw new Error(`Resource "${resourceName}" not found for this gang`);

  const { error } = await supabase
    .from('campaign_gang_resources')
    .update({ quantity: resource.quantity + amount })
    .eq('id', resource.id);

  if (error) throw new Error(`Failed to return resource: ${error.message}`);
}

export const REPUTATION_RESOURCE_NAME = 'Reputation';

export async function deductGangReputation(
  supabase: SupabaseClient,
  gangId: string,
  amount: number
): Promise<void> {
  if (amount <= 0) throw new Error('Reputation amount must be greater than 0');

  const { data: gang, error: fetchError } = await supabase
    .from('gangs')
    .select('reputation')
    .eq('id', gangId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch gang: ${fetchError.message}`);
  if (!gang) throw new Error('Gang not found');

  const current = gang.reputation ?? 0;
  if (current < amount) {
    throw new Error(`Insufficient Reputation. Required: ${amount}, Available: ${current}`);
  }

  const { data, error } = await supabase
    .from('gangs')
    .update({ reputation: current - amount })
    .eq('id', gangId)
    .gte('reputation', amount)
    .select('id');

  if (error) throw new Error(`Failed to deduct reputation: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error('Insufficient Reputation (concurrent modification)');
  }
}

export async function returnGangReputation(
  supabase: SupabaseClient,
  gangId: string,
  amount: number
): Promise<void> {
  const { data: gang, error: fetchError } = await supabase
    .from('gangs')
    .select('reputation')
    .eq('id', gangId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch gang: ${fetchError.message}`);
  if (!gang) throw new Error('Gang not found');

  const { error } = await supabase
    .from('gangs')
    .update({ reputation: (gang.reputation ?? 0) + amount })
    .eq('id', gangId);

  if (error) throw new Error(`Failed to return reputation: ${error.message}`);
}
