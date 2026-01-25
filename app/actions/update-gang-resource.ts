'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { getAuthenticatedUser } from '@/utils/auth';

export interface UpdateGangResourceParams {
  campaign_gang_id: string;
  resource_id: string;
  is_custom: boolean;
  quantity_delta: number; // Positive to add, negative to subtract
}

export interface UpdateGangResourceResult {
  success: boolean;
  error?: string;
  data?: {
    resource_id: string;
    resource_name: string;
    quantity: number;
    is_custom: boolean;
  };
}

/**
 * Update a gang's resource quantity in the normalised campaign_gang_resources table.
 * Creates the record if it doesn't exist.
 */
export async function updateGangResource(params: UpdateGangResourceParams): Promise<UpdateGangResourceResult> {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    const user = await getAuthenticatedUser(supabase);

    // Get the campaign_gang to verify ownership and get campaign_id/gang_id
    const { data: campaignGang, error: cgError } = await supabase
      .from('campaign_gangs')
      .select(`
        id,
        gang_id,
        campaign_id,
        gangs!gang_id (
          user_id
        )
      `)
      .eq('id', params.campaign_gang_id)
      .single();

    if (cgError || !campaignGang) {
      return {
        success: false,
        error: 'Campaign gang not found'
      };
    }

    // Check if user owns the gang or is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin = profile?.user_role === 'admin';
    const gangOwnerId = (campaignGang.gangs as any)?.user_id;
    
    if (!isAdmin && gangOwnerId !== user.id) {
      // Check if user is campaign owner/arbitrator
      const { data: campaignMember } = await supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', campaignGang.campaign_id)
        .eq('user_id', user.id)
        .in('role', ['OWNER', 'ARBITRATOR'])
        .maybeSingle();

      if (!campaignMember) {
        return {
          success: false,
          error: 'You do not have permission to update this gang\'s resources'
        };
      }
    }

    // Build the query based on whether it's a custom or predefined resource
    const resourceColumn = params.is_custom ? 'campaign_resource_id' : 'campaign_type_resource_id';
    const otherColumn = params.is_custom ? 'campaign_type_resource_id' : 'campaign_resource_id';

    // Check if the resource record already exists
    const { data: existingResource } = await supabase
      .from('campaign_gang_resources')
      .select('id, quantity')
      .eq('campaign_gang_id', params.campaign_gang_id)
      .eq(resourceColumn, params.resource_id)
      .maybeSingle();

    let newQuantity: number;
    let resultData: any;

    if (existingResource) {
      // Update existing record
      newQuantity = (existingResource.quantity || 0) + params.quantity_delta;
      
      const { data: updated, error: updateError } = await supabase
        .from('campaign_gang_resources')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingResource.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      resultData = updated;
    } else {
      // Create new record
      newQuantity = params.quantity_delta;
      
      if (newQuantity === 0) {
        // No point creating a zero-quantity record
        return {
          success: true,
          data: {
            resource_id: params.resource_id,
            resource_name: '',
            quantity: 0,
            is_custom: params.is_custom
          }
        };
      }

      const insertData: any = {
        campaign_gang_id: params.campaign_gang_id,
        [resourceColumn]: params.resource_id,
        [otherColumn]: null,
        quantity: newQuantity
      };

      const { data: created, error: createError } = await supabase
        .from('campaign_gang_resources')
        .insert(insertData)
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      resultData = created;
    }

    // Fetch the resource name for the response
    let resourceName = '';
    if (params.is_custom) {
      const { data: resource } = await supabase
        .from('campaign_resources')
        .select('resource_name')
        .eq('id', params.resource_id)
        .single();
      resourceName = resource?.resource_name || '';
    } else {
      const { data: resource } = await supabase
        .from('campaign_type_resources')
        .select('resource_name')
        .eq('id', params.resource_id)
        .single();
      resourceName = resource?.resource_name || '';
    }

    // Invalidate relevant caches
    revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(campaignGang.gang_id));
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_MEMBERS(campaignGang.campaign_id));
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_RESOURCES(campaignGang.campaign_id));

    return {
      success: true,
      data: {
        resource_id: params.resource_id,
        resource_name: resourceName,
        quantity: newQuantity,
        is_custom: params.is_custom
      }
    };
  } catch (error) {
    console.error('Error updating gang resource:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update gang resource'
    };
  }
}

/**
 * Batch update multiple gang resources at once.
 * More efficient for updating several resources in one operation.
 */
export async function updateGangResources(
  campaignGangId: string,
  updates: Array<{
    resource_id: string;
    is_custom: boolean;
    quantity_delta: number;
  }>
): Promise<UpdateGangResourceResult> {
  // Process each update sequentially to avoid race conditions
  let lastResult: UpdateGangResourceResult = { success: true };
  
  for (const update of updates) {
    const result = await updateGangResource({
      campaign_gang_id: campaignGangId,
      ...update
    });
    
    if (!result.success) {
      return result;
    }
    lastResult = result;
  }
  
  return lastResult;
}
