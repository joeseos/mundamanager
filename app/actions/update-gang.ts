'use server'

import { invalidateGang, invalidateGangOverview, invalidateGangCampaignMembership, invalidateGangFinancials, invalidateCampaign, invalidateUser } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";

import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { getAuthenticatedUser } from '@/utils/auth';
import { logGangResourceChanges } from './logs/gang-resource-logs';
import { gangEditionSlug, hasTradePoints } from '@/types/edition';
import { sanitizeResourceReason } from '@/utils/sanitize-resource-reason';

interface UpdateGangParams {
  gang_id: string;
  campaign_gang_id?: string; // Required for resource updates
  name?: string;
  credits?: number;
  credits_operation?: 'add' | 'subtract';
  credits_reason?: string;
  alignment?: string;
  gang_colour?: string;
  alliance_id?: string | null;
  gang_affiliation_id?: string | null;
  gang_origin_id?: string | null;
  reputation?: number;
  reputation_operation?: 'add' | 'subtract';
  reputation_reason?: string;
  trade_points?: number;
  trade_points_operation?: 'add' | 'subtract';
  trade_points_reason?: string;
  // Dynamic resources - array of updates for campaign_gang_resources
  resources?: Array<{
    resource_id: string;
    resource_name: string;
    is_custom: boolean;
    quantity_delta: number;
    reason?: string;
  }>;
  gang_variants?: string[];
  note?: string;
  hidden?: boolean;
}

interface UpdateGangResult {
  success: boolean;
  data?: {
    gang_id: string;
    name: string;
    credits: number;
    reputation: number;
    trade_points: number;
    alignment: string;
    alliance_id: string | null;
    alliance_name?: string;
    gang_affiliation_id: string | null;
    gang_affiliation_name?: string;
    gang_origin_id: string | null;
    gang_origin_name?: string;
    gang_colour: string;
    last_updated: string;
    gang_variants: Array<{id: string, variant: string}>;
    resources?: Array<{
      resource_id: string;
      resource_name: string;
      quantity: number;
      is_custom: boolean;
    }>;
    failedResources?: Array<{
      resource_name: string;
      error: string;
    }>;
  };
  error?: string;
}

export async function updateGang(params: UpdateGangParams): Promise<UpdateGangResult> {
  try {
    const supabase = await createClient();
    
    // Ensure the caller is authenticated (RLS handles write permissions)
    await getAuthenticatedUser(supabase);

    // Get gang information (RLS will handle permissions)
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select(`
        id, user_id, credits, reputation, trade_points, rating, wealth,
        gang_types!gang_type_id ( editions:edition_id ( slug ) ),
        custom_gang_types!custom_gang_type_id ( editions:edition_id ( slug ) )
      `)
      .eq('id', params.gang_id)
      .single();

    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    // Prepare update object
    const updates: any = {
      last_updated: new Date().toISOString()
    };

    // Track what changed for cache invalidation
    let creditsChanged = false;

    // Add name if provided
    if (params.name !== undefined) {
      updates.name = params.name.trimEnd();
    }

    // Add note if provided
    if (params.note !== undefined) {
      updates.note = params.note;
    }

    // Add alignment if provided
    if (params.alignment !== undefined) {
      if (!['Law Abiding', 'Outlaw'].includes(params.alignment)) {
        throw new Error("Invalid alignment value. Must be 'Law Abiding' or 'Outlaw'");
      }
      updates.alignment = params.alignment;
    }

    // Add gang_colour if provided
    if (params.gang_colour !== undefined) {
      updates.gang_colour = params.gang_colour;
    }

    // Add alliance_id if provided
    if (params.alliance_id !== undefined) {
      updates.alliance_id = params.alliance_id;
    }

    // Add gang_affiliation_id if provided
    if (params.gang_affiliation_id !== undefined) {
      updates.gang_affiliation_id = params.gang_affiliation_id;
    }

    // Add gang_origin_id if provided
    if (params.gang_origin_id !== undefined) {
      updates.gang_origin_id = params.gang_origin_id;
    }

    // Add hidden if provided
    if (params.hidden !== undefined) {
      updates.hidden = params.hidden;
    }

    // Campaign resources are now handled separately via campaign_gang_resources table
    // (removed legacy resource fields from gangs table)

    // Handle credits and reputation changes (still on gangs table)
    // Track if credits will change (handled by updateGangFinancials)
    if (params.credits !== undefined && params.credits_operation) {
      creditsChanged = true;
    }

    if (params.reputation !== undefined && params.reputation_operation) {
      updates.reputation = params.reputation_operation === 'add'
        ? (gang.reputation || 0) + params.reputation
        : (gang.reputation || 0) - params.reputation;
    }

    // Gate the write on the gang's own edition, derived server-side via its gang
    // type, so the resource can never be set for an edition that lacks it even if
    // a client sends the field.
    let tradePointsChanged = false;
    if (params.trade_points !== undefined && params.trade_points_operation) {
      const editionSlug = gangEditionSlug(gang);
      if (!hasTradePoints(editionSlug)) {
        throw new Error('Trade Points is not available for this gang edition');
      }
      updates.trade_points = params.trade_points_operation === 'add'
        ? (gang.trade_points || 0) + params.trade_points
        : (gang.trade_points || 0) - params.trade_points;
      tradePointsChanged = true;
    }

    // Handle gang variants - store as JSONB array
    if (params.gang_variants !== undefined) {
      updates.gang_variants = params.gang_variants;
    }

    // Perform the gang update
    const { data: updatedGang, error: gangUpdateError } = await supabase
      .from("gangs")
      .update(updates)
      .eq('id', params.gang_id)
      .select(`
        id,
        name,
        credits,
        reputation,
        trade_points,
        alignment,
        alliance_id,
        gang_affiliation_id,
        gang_origin_id,
        gang_colour,
        last_updated
      `)
      .single();

    if (gangUpdateError) {
      throw new Error(`Failed to update gang: ${gangUpdateError.message}`);
    }

    // Handle campaign resource updates if provided
    let updatedResources: Array<{resource_id: string; resource_name: string; quantity: number; is_custom: boolean}> = [];
    let failedResources: Array<{resource_name: string; error: string}> = [];
    let oldResourceStates: Record<string, number> = {};
    let newResourceStates: Record<string, number> = {};

    if (params.resources && params.resources.length > 0 && params.campaign_gang_id) {
      // Fetch current resource values for logging
      const resourceIds = params.resources.map(r => r.resource_id);
      const customResourceIds = params.resources.filter(r => r.is_custom).map(r => r.resource_id);
      const predefinedResourceIds = params.resources.filter(r => !r.is_custom).map(r => r.resource_id);

      // Get existing resources for this campaign gang
      let existingResources: any[] = [];
      
      if (predefinedResourceIds.length > 0 || customResourceIds.length > 0) {
        const orConditions = [];
        if (predefinedResourceIds.length > 0) {
          orConditions.push(`campaign_type_resource_id.in.(${predefinedResourceIds.join(',')})`);
        }
        if (customResourceIds.length > 0) {
          orConditions.push(`campaign_resource_id.in.(${customResourceIds.join(',')})`);
        }

        const { data } = await supabase
          .from('campaign_gang_resources')
          .select('id, campaign_type_resource_id, campaign_resource_id, quantity')
          .eq('campaign_gang_id', params.campaign_gang_id)
          .or(orConditions.join(','));
        
        existingResources = data || [];
      }

      // Update or insert each resource
      for (const resource of params.resources) {
        const resourceColumn = resource.is_custom ? 'campaign_resource_id' : 'campaign_type_resource_id';
        const otherColumn = resource.is_custom ? 'campaign_type_resource_id' : 'campaign_resource_id';
        const existing = existingResources.find(r => 
          (resource.is_custom && r.campaign_resource_id === resource.resource_id) ||
          (!resource.is_custom && r.campaign_type_resource_id === resource.resource_id)
        );

        const oldQuantity = existing?.quantity || 0;
        const newQuantity = oldQuantity + resource.quantity_delta;

        // Store for logging
        oldResourceStates[resource.resource_name] = oldQuantity;
        newResourceStates[resource.resource_name] = newQuantity;

        if (existing) {
          // Update existing resource
          const { error: updateError } = await supabase
            .from('campaign_gang_resources')
            .update({ 
              quantity: newQuantity,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (updateError) {
            console.error('Failed to update resource:', updateError);
            failedResources.push({
              resource_name: resource.resource_name,
              error: updateError.message
            });
          } else {
            updatedResources.push({
              resource_id: resource.resource_id,
              resource_name: resource.resource_name,
              quantity: newQuantity,
              is_custom: resource.is_custom
            });
          }
        } else {
          // Create new resource record
          const insertData: any = {
            campaign_gang_id: params.campaign_gang_id,
            [resourceColumn]: resource.resource_id,
            [otherColumn]: null,
            quantity: newQuantity
          };

          const { error: insertError } = await supabase
            .from('campaign_gang_resources')
            .insert(insertData);

          if (insertError) {
            console.error('Failed to insert resource:', insertError);
            failedResources.push({
              resource_name: resource.resource_name,
              error: insertError.message
            });
          } else {
            updatedResources.push({
              resource_id: resource.resource_id,
              resource_name: resource.resource_name,
              quantity: newQuantity,
              is_custom: resource.is_custom
            });
          }
        }
      }
    }

    // Fetch alliance name if alliance_id was updated
    let allianceName: string | null = null;
    if (params.alliance_id !== undefined && updatedGang.alliance_id) {
      const { data: allianceData, error: allianceError } = await supabase
        .from('alliances')
        .select('alliance_name')
        .eq('id', updatedGang.alliance_id)
        .single();

      if (!allianceError && allianceData) {
        allianceName = allianceData.alliance_name;
      }
    }

    // Fetch gang affiliation name if gang_affiliation_id was updated
    let gangAffiliationName: string | null = null;
    if (params.gang_affiliation_id !== undefined) {
      if (updatedGang.gang_affiliation_id) {
        const { data: affiliationData, error: affiliationError } = await supabase
          .from('gang_affiliation')
          .select('name')
          .eq('id', updatedGang.gang_affiliation_id)
          .single();

        if (!affiliationError && affiliationData) {
          gangAffiliationName = affiliationData.name;
        }
      } else {
        // If gang_affiliation_id is null, set name to empty
        gangAffiliationName = '';
      }
    }

    // Fetch updated gang variants if they were changed
    let gangVariants: Array<{id: string, variant: string}> = [];
    if (params.gang_variants !== undefined && params.gang_variants.length > 0) {
      const { data: variantsData, error: variantsError } = await supabase
        .from('gang_variant_types')
        .select('id, variant')
        .in('id', params.gang_variants);

      if (!variantsError && variantsData) {
        gangVariants = variantsData.map((v: any) => ({
          id: v.id,
          variant: v.variant
        }));
      }
    }

    // Declare variable to store financial result for later use
    let financialResult: any = null;

    // Granular cache invalidation based on what changed

    // Always invalidate basic gang data if gang settings changed
    if (params.name !== undefined || params.alignment !== undefined ||
        params.gang_colour !== undefined || params.alliance_id !== undefined ||
        params.gang_affiliation_id !== undefined || params.gang_origin_id !== undefined ||
        params.hidden !== undefined) {
      invalidateGang(params.gang_id);
      invalidateGangOverview(params.gang_id);
    }
    
    // Invalidate credits if changed and update wealth
    if (creditsChanged) {
      // Calculate delta from params: positive for add, negative for subtract
      const creditsDelta = params.credits_operation === 'add'
        ? params.credits!
        : -params.credits!;

      financialResult = await updateGangFinancials(supabase, {
        gangId: params.gang_id,
        creditsDelta
      });

      if (!financialResult.success) {
        throw new Error(financialResult.error || 'Failed to update gang financials');
      }

      invalidateGangFinancials(params.gang_id);
    }
    
    // Reputation and trade points live in the gang core entry, and their
    // cross-page copies under the overview tag
    if ((params.reputation !== undefined && params.reputation_operation) || tradePointsChanged) {
      invalidateGangFinancials(params.gang_id);
    }

    // Invalidate campaign resources cache if resources were updated
    if (params.resources && params.resources.length > 0 && params.campaign_gang_id) {
      // Get campaign_id to invalidate campaign caches
      const { data: campaignGang } = await supabase
        .from('campaign_gangs')
        .select('campaign_id')
        .eq('id', params.campaign_gang_id)
        .single();

      if (campaignGang) {
        invalidateCampaign(campaignGang.campaign_id);
        invalidateCampaign(campaignGang.campaign_id);
      }
      
      // Invalidate gang's campaign data cache (includes resources for gang page)
      invalidateGangCampaignMembership(params.gang_id);
    }
    
    // If gang variants were updated, invalidate basic gang data (variants are stored there)
    if (params.gang_variants !== undefined) {
      invalidateGang(params.gang_id);
    }

    // NOTE: No need to invalidate COMPOSITE_GANG_FIGHTERS_LIST - gang page uses specific granular tags

    // Invalidate campaign caches if this gang is in any campaigns
    const { data: campaignGangs, error: campaignGangsError } = await supabase
      .from('campaign_gangs')
      .select('campaign_id')
      .eq('gang_id', params.gang_id);
    if (!campaignGangsError && campaignGangs && campaignGangs.length > 0) {
      for (const cg of campaignGangs) {
        const campaignId = cg.campaign_id;
        invalidateCampaign(campaignId);
        invalidateCampaign(campaignId);
        invalidateCampaign(campaignId);
      }
    }

    // Log resource changes (campaign resources + credits/reputation)
    try {
      // Get final credits value from financialResult if credits changed
      const finalCredits = creditsChanged && financialResult?.newValues?.credits
        ? financialResult.newValues.credits
        : gang.credits;

      const oldState: Record<string, number> = {
        ...oldResourceStates,
        credits: gang.credits,
        rating: gang.rating || 0,
        wealth: gang.wealth || 0,
        reputation: gang.reputation || 0
      };

      const newState: Record<string, number> = {
        ...newResourceStates,
        credits: finalCredits,
        rating: gang.rating || 0,  // Rating unchanged by manual credit changes
        wealth: financialResult?.newValues?.wealth ?? (gang.wealth || 0),
        reputation: updates.reputation ?? (gang.reputation || 0)
      };

      // Only include Trade Points in the log when it actually changed, so
      // non-N26 gangs never get a spurious "trade points" log entry.
      if (tradePointsChanged) {
        oldState['trade points'] = gang.trade_points || 0;
        newState['trade points'] = updates.trade_points ?? (gang.trade_points || 0);
      }

      const reasons: Record<string, string> = {};
      const creditsReason = sanitizeResourceReason(params.credits_reason);
      if (creditsReason) {
        reasons['credits'] = creditsReason;
      }
      const reputationReason = sanitizeResourceReason(params.reputation_reason);
      if (reputationReason) {
        reasons['reputation'] = reputationReason;
      }
      const tradePointsReason = sanitizeResourceReason(params.trade_points_reason);
      if (tradePointsReason) {
        reasons['trade points'] = tradePointsReason;
      }
      if (params.resources) {
        for (const resource of params.resources) {
          const reason = sanitizeResourceReason(resource.reason);
          if (reason) {
            reasons[resource.resource_name] = reason;
          }
        }
      }

      // Only log if something changed
      if (Object.keys(oldResourceStates).length > 0 || creditsChanged || (params.reputation !== undefined && params.reputation_operation) || tradePointsChanged) {
        // Use gang owner's user_id so logs are attributed to the owner even
        // when an arbitrator edits on their behalf (matches gang-campaign-logs).
        // Ownerless gangs fall back to the caller inside createGangLog.
        await logGangResourceChanges({
          gang_id: params.gang_id,
          oldState,
          newState,
          user_id: gang.user_id ?? undefined,
          ...(Object.keys(reasons).length > 0 ? { reasons } : {}),
        });
      }
    } catch (logError) {
      // Log the error but don't fail the update
      console.error('Failed to log gang resource changes:', logError);
    }

    // Home page gangs list cache (server-side, user-scoped)
    invalidateUser(gang.user_id);

    return {
      success: true,
      data: {
        gang_id: updatedGang.id,
        name: updatedGang.name,
        credits: creditsChanged && financialResult?.newValues?.credits
          ? financialResult.newValues.credits
          : updatedGang.credits,
        reputation: updatedGang.reputation,
        trade_points: updatedGang.trade_points,
        alignment: updatedGang.alignment,
        alliance_id: updatedGang.alliance_id,
        alliance_name: allianceName || undefined,
        gang_affiliation_id: updatedGang.gang_affiliation_id,
        gang_affiliation_name: gangAffiliationName || undefined,
        gang_origin_id: updatedGang.gang_origin_id,
        gang_origin_name: undefined, // Frontend handles display
        gang_colour: updatedGang.gang_colour,
        last_updated: updatedGang.last_updated,
        gang_variants: gangVariants,
        resources: updatedResources.length > 0 ? updatedResources : undefined,
        failedResources: failedResources.length > 0 ? failedResources : undefined
      }
    };

  } catch (error) {
    console.error('Error in updateGang server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}