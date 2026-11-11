import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostResourcePayload } from '@/types/equipment';

export interface CampaignResource {
  id: string;
  resource_name: string;
  is_custom: boolean;
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

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to look up gang resource: ${error.message}`);
  return data;
}

export async function deductGangResource(
  supabase: SupabaseClient,
  campaignGangId: string,
  amount: number,
  campaignTypeResourceId?: string,
  campaignResourceId?: string
): Promise<void> {
  if (amount <= 0) throw new Error('Resource amount must be greater than 0');

  const resource = await findGangResourceById(supabase, campaignGangId, campaignTypeResourceId, campaignResourceId);

  if (!resource) {
    throw new Error('Resource not found for this gang');
  }
  if (resource.quantity < amount) {
    throw new Error(`Not enough resource. Required: ${amount}, Available: ${resource.quantity}`);
  }

  const { data, error } = await supabase
    .from('campaign_gang_resources')
    .update({ quantity: resource.quantity - amount })
    .eq('id', resource.id)
    .gte('quantity', amount)
    .select('id');

  if (error) throw new Error(`Failed to deduct resource: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error('Not enough resource (concurrent modification)');
  }
}

export async function returnGangResource(
  supabase: SupabaseClient,
  campaignGangId: string,
  amount: number,
  campaignTypeResourceId?: string,
  campaignResourceId?: string
): Promise<void> {
  const resource = await findGangResourceById(supabase, campaignGangId, campaignTypeResourceId, campaignResourceId);
  if (!resource) throw new Error('Resource not found for this gang');

  const { error } = await supabase
    .from('campaign_gang_resources')
    .update({ quantity: resource.quantity + amount })
    .eq('id', resource.id);

  if (error) throw new Error(`Failed to return resource: ${error.message}`);
}

export const REPUTATION_RESOURCE_NAME = 'Reputation';

export async function returnCostResource(
  supabase: SupabaseClient,
  gangId: string,
  costResource: CostResourcePayload
): Promise<void> {
  if (costResource.name === REPUTATION_RESOURCE_NAME) {
    await returnGangReputation(supabase, gangId, costResource.amount);
  } else {
    if (!costResource.campaign_gang_id) {
      throw new Error('Missing campaign_gang_id in stored resource data');
    }
    await returnGangResource(supabase, costResource.campaign_gang_id, costResource.amount, costResource.campaign_type_resource_id, costResource.campaign_resource_id);
  }
}

/**
 * Reputation is spent through updateGangFinancials, so that a purchase paid partly in
 * reputation moves it in the same guarded UPDATE as credits and Trade Points. Only the
 * refund path needs a standalone helper.
 */
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

/**
 * Catalog Trade Points are stored as text so "E" (Exclusive) is representable alongside
 * numeric costs. Accepts a non-negative integer or "E", case-insensitively.
 */
export function isValidTradePoints(value: string): boolean {
  return /^(E|\d+)$/i.test(value.trim());
}

/** True when a Trade Points value is Exclusive rather than a numeric cost. */
export function isExclusiveTradePoints(value: string | null | undefined): boolean {
  return value?.trim().toUpperCase() === 'E';
}

/**
 * Parse catalog Trade Points cost. "E" (and empty/null) means 0 TP.
 */
export function parseTradePointsCost(value: string | null | undefined): number {
  if (value == null) return 0;
  const trimmed = String(value).trim();
  if (!trimmed || isExclusiveTradePoints(trimmed)) return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

