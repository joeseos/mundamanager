'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

import { DESCRIPTION_MAX_LENGTH } from './custom-trading-posts-constants';

export interface CustomTradingPostData {
  custom_trading_post_name: string;
  description?: string | null;
}

export interface CustomTradingPost {
  id: string;
  user_id: string;
  custom_trading_post_name: string;
  description?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export async function createCustomTradingPost(
  data: CustomTradingPostData
): Promise<{ success: boolean; data?: CustomTradingPost; error?: string }> {
  if (data.description && data.description.length > DESCRIPTION_MAX_LENGTH) {
    return { success: false, error: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.` };
  }
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: newTradingPost, error: insertError } = await supabase
      .from('custom_trading_posts')
      .insert({
        user_id: user.id,
        custom_trading_post_name: data.custom_trading_post_name.trimEnd(),
        description: data.description || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating custom trading post:', insertError);
      return { success: false, error: `Failed to create custom trading post: ${insertError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: newTradingPost };
  } catch (error) {
    console.error('Error in createCustomTradingPost:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function updateCustomTradingPost(
  id: string,
  data: CustomTradingPostData
): Promise<{ success: boolean; data?: CustomTradingPost; error?: string }> {
  if (data.description && data.description.length > DESCRIPTION_MAX_LENGTH) {
    return { success: false, error: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.` };
  }
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: existing, error: fetchError } = await supabase
      .from('custom_trading_posts')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: 'Custom trading post not found or not owned by user' };
    }

    const { data: updated, error: updateError } = await supabase
      .from('custom_trading_posts')
      .update({
        custom_trading_post_name: data.custom_trading_post_name.trimEnd(),
        description: data.description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating custom trading post:', updateError);
      return { success: false, error: `Failed to update custom trading post: ${updateError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error in updateCustomTradingPost:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function deleteCustomTradingPost(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: existing, error: fetchError } = await supabase
      .from('custom_trading_posts')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: 'Custom trading post not found or not owned by user' };
    }

    const { data: sharedCampaigns } = await supabase
      .from('custom_shared')
      .select('campaign_id')
      .eq('custom_trading_post_id', id);

    const affectedCampaignIds = (sharedCampaigns || []).map(s => s.campaign_id);

    const { error: deleteError } = await supabase
      .from('custom_trading_posts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting custom trading post:', deleteError);
      return { success: false, error: `Failed to delete custom trading post: ${deleteError.message}` };
    }

    if (affectedCampaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, custom_trading_posts')
        .in('id', affectedCampaignIds);

      for (const campaign of campaigns || []) {
        const currentPosts = (campaign.custom_trading_posts as string[]) || [];
        if (currentPosts.includes(id)) {
          const updated = currentPosts.filter((postId: string) => postId !== id);
          await supabase
            .from('campaigns')
            .update({ custom_trading_posts: updated })
            .eq('id', campaign.id);
          revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(campaign.id));
        }
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteCustomTradingPost:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

const TP_EQUIPMENT_SELECT = `
  id, custom_trading_post_id, equipment_id, custom_equipment_id,
  cost_override, cost_type_resource_id, cost_campaign_resource_id, cost_reputation, cost_resource_amount,
  availability_override, sort_order,
  equipment:equipment_id (equipment_name, equipment_category),
  custom_equipment:custom_equipment_id (equipment_name, equipment_category)
`;

function mapTPEquipmentRow(row: any): CustomTPEquipment {
  return {
    id: row.id,
    custom_trading_post_id: row.custom_trading_post_id,
    equipment_id: row.equipment_id,
    custom_equipment_id: row.custom_equipment_id,
    equipment_name: row.equipment?.equipment_name ?? row.custom_equipment?.equipment_name ?? 'Unknown',
    equipment_category: row.equipment?.equipment_category ?? row.custom_equipment?.equipment_category ?? '',
    is_custom: !!row.custom_equipment_id,
    cost_override: row.cost_override,
    cost_type_resource_id: row.cost_type_resource_id ?? null,
    cost_campaign_resource_id: row.cost_campaign_resource_id ?? null,
    cost_reputation: row.cost_reputation ?? false,
    cost_resource_amount: row.cost_resource_amount ?? null,
    availability_override: row.availability_override,
    sort_order: row.sort_order,
  };
}

async function resolveGangTypeNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from('gang_types')
    .select('gang_type_id, gang_type')
    .in('gang_type_id', ids);
  return (data || []).reduce<Record<string, string>>((acc, gt: any) => {
    acc[gt.gang_type_id] = gt.gang_type;
    return acc;
  }, {});
}

export interface CustomTPEquipment {
  id: string;
  custom_trading_post_id: string;
  equipment_id: string | null;
  custom_equipment_id: string | null;
  equipment_name: string;
  equipment_category: string;
  is_custom: boolean;
  cost_override: number | null;
  cost_type_resource_id: string | null;
  cost_campaign_resource_id: string | null;
  cost_reputation: boolean;
  cost_resource_amount: number | null;
  availability_override: string | null;
  sort_order: number | null;
}

export interface CustomTPAvailabilityRule {
  id: string;
  custom_trading_post_equipment_id: string;
  gang_type_id: string | null;
  custom_gang_type_id: string | null;
  gang_origin_id: string | null;
  gang_variant_id: string | null;
  campaign_type_allegiance_id: string | null;
  alignment: string | null;
  availability: string | null;
  gang_type_name: string | null;
  gang_origin_name: string | null;
  gang_variant_name: string | null;
  allegiance_name: string | null;
}

export interface CustomTPPricingRule {
  id: string;
  custom_trading_post_equipment_id: string;
  gang_type_id: string | null;
  custom_gang_type_id: string | null;
  gang_origin_id: string | null;
  fighter_type_id: string | null;
  adjusted_cost: number | null;
  gang_type_name: string | null;
  gang_origin_name: string | null;
  fighter_type_name: string | null;
}

export async function getTPEquipment(
  tradingPostId: string
): Promise<{ success: boolean; data?: CustomTPEquipment[]; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data, error } = await supabase
      .from('custom_trading_post_equipment')
      .select(TP_EQUIPMENT_SELECT)
      .eq('custom_trading_post_id', tradingPostId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching TP equipment:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []).map(mapTPEquipmentRow) };
  } catch (error) {
    console.error('Error in getTPEquipment:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function addTPEquipmentBatch(
  tradingPostId: string,
  items: Array<{ equipmentId: string; isCustom: boolean; costOverride?: number | null; availabilityOverride?: string | null }>
): Promise<{ success: boolean; data?: Array<{ id: string; equipment_id: string | null; custom_equipment_id: string | null }>; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: tp, error: tpError } = await supabase
      .from('custom_trading_posts')
      .select('id')
      .eq('id', tradingPostId)
      .eq('user_id', user.id)
      .single();

    if (tpError || !tp) {
      return { success: false, error: 'Trading post not found or not owned by user' };
    }

    const { data: maxSort } = await supabase
      .from('custom_trading_post_equipment')
      .select('sort_order')
      .eq('custom_trading_post_id', tradingPostId)
      .order('sort_order', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    const startSort = (maxSort?.sort_order ?? 0) + 1;

    const rows = items.map((item, i) => ({
      user_id: user.id,
      custom_trading_post_id: tradingPostId,
      sort_order: startSort + i,
      ...(item.isCustom
        ? { custom_equipment_id: item.equipmentId }
        : { equipment_id: item.equipmentId }),
      ...(item.costOverride != null ? { cost_override: item.costOverride } : {}),
      ...(item.availabilityOverride != null ? { availability_override: item.availabilityOverride } : {}),
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('custom_trading_post_equipment')
      .insert(rows)
      .select('id, equipment_id, custom_equipment_id');

    if (insertError) throw insertError;

    revalidatePath('/');
    return {
      success: true,
      data: (inserted ?? []).map(r => ({
        id: r.id,
        equipment_id: r.equipment_id ?? null,
        custom_equipment_id: r.custom_equipment_id ?? null,
      })),
    };
  } catch (error) {
    console.error('Error in addTPEquipmentBatch:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function updateTPEquipment(
  id: string,
  data: {
    cost_override?: number | null;
    cost_type_resource_id?: string | null;
    cost_campaign_resource_id?: string | null;
    cost_reputation?: boolean;
    cost_resource_amount?: number | null;
    availability_override?: string | null;
    sort_order?: number | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('custom_trading_post_equipment')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating TP equipment:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in updateTPEquipment:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function removeTPEquipment(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('custom_trading_post_equipment')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error removing TP equipment:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in removeTPEquipment:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Availability rules
// ---------------------------------------------------------------------------

export async function getAvailabilityRules(
  equipmentItemId: string
): Promise<{ success: boolean; data?: CustomTPAvailabilityRule[]; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data, error } = await supabase
      .from('custom_trading_post_availability')
      .select(`
        id,
        custom_trading_post_equipment_id,
        gang_type_id,
        custom_gang_type_id,
        gang_origin_id,
        gang_variant_id,
        campaign_type_allegiance_id,
        alignment,
        availability,
        custom_gang_types (gang_type),
        gang_origins (origin_name),
        gang_variant_types (variant),
        campaign_type_allegiances (allegiance_name)
      `)
      .eq('custom_trading_post_equipment_id', equipmentItemId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching availability rules:', error);
      return { success: false, error: error.message };
    }

    const gangTypeIds = (data || []).map((r: any) => r.gang_type_id).filter(Boolean);
    const gangTypeNames = await resolveGangTypeNames(supabase, gangTypeIds);

    const rules: CustomTPAvailabilityRule[] = (data || []).map((row: any) => ({
      id: row.id,
      custom_trading_post_equipment_id: row.custom_trading_post_equipment_id,
      gang_type_id: row.gang_type_id,
      custom_gang_type_id: row.custom_gang_type_id,
      gang_origin_id: row.gang_origin_id,
      gang_variant_id: row.gang_variant_id,
      campaign_type_allegiance_id: row.campaign_type_allegiance_id,
      alignment: row.alignment,
      availability: row.availability,
      gang_type_name: row.gang_type_id
        ? gangTypeNames[row.gang_type_id] || null
        : row.custom_gang_types?.gang_type || null,
      gang_origin_name: row.gang_origins?.origin_name || null,
      gang_variant_name: row.gang_variant_types?.variant || null,
      allegiance_name: row.campaign_type_allegiances?.allegiance_name || null,
    }));

    return { success: true, data: rules };
  } catch (error) {
    console.error('Error in getAvailabilityRules:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function addAvailabilityRule(
  equipmentItemId: string,
  data: {
    gang_type_id?: string | null;
    custom_gang_type_id?: string | null;
    gang_origin_id?: string | null;
    gang_variant_id?: string | null;
    campaign_type_allegiance_id?: string | null;
    alignment?: string | null;
    availability?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('custom_trading_post_availability')
      .insert({
        user_id: user.id,
        custom_trading_post_equipment_id: equipmentItemId,
        gang_type_id: data.gang_type_id || null,
        custom_gang_type_id: data.custom_gang_type_id || null,
        gang_origin_id: data.gang_origin_id || null,
        gang_variant_id: data.gang_variant_id || null,
        campaign_type_allegiance_id: data.campaign_type_allegiance_id || null,
        alignment: data.alignment || null,
        availability: data.availability || null,
      });

    if (error) {
      console.error('Error adding availability rule:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in addAvailabilityRule:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteAvailabilityRule(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('custom_trading_post_availability')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting availability rule:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteAvailabilityRule:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Pricing rules
// ---------------------------------------------------------------------------

export async function getPricingRules(
  equipmentItemId: string
): Promise<{ success: boolean; data?: CustomTPPricingRule[]; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data, error } = await supabase
      .from('custom_trading_post_pricing')
      .select(`
        id,
        custom_trading_post_equipment_id,
        gang_type_id,
        custom_gang_type_id,
        gang_origin_id,
        fighter_type_id,
        adjusted_cost,
        custom_gang_types (gang_type),
        gang_origins (origin_name),
        fighter_types (fighter_type)
      `)
      .eq('custom_trading_post_equipment_id', equipmentItemId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching pricing rules:', error);
      return { success: false, error: error.message };
    }

    const gangTypeIds = (data || []).map((r: any) => r.gang_type_id).filter(Boolean);
    const gangTypeNames = await resolveGangTypeNames(supabase, gangTypeIds);

    const rules: CustomTPPricingRule[] = (data || []).map((row: any) => ({
      id: row.id,
      custom_trading_post_equipment_id: row.custom_trading_post_equipment_id,
      gang_type_id: row.gang_type_id,
      custom_gang_type_id: row.custom_gang_type_id,
      gang_origin_id: row.gang_origin_id,
      fighter_type_id: row.fighter_type_id,
      adjusted_cost: row.adjusted_cost,
      gang_type_name: row.gang_type_id
        ? gangTypeNames[row.gang_type_id] || null
        : row.custom_gang_types?.gang_type || null,
      gang_origin_name: row.gang_origins?.origin_name || null,
      fighter_type_name: row.fighter_types?.fighter_type || null,
    }));

    return { success: true, data: rules };
  } catch (error) {
    console.error('Error in getPricingRules:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function addPricingRule(
  equipmentItemId: string,
  data: {
    gang_type_id?: string | null;
    custom_gang_type_id?: string | null;
    gang_origin_id?: string | null;
    fighter_type_id?: string | null;
    adjusted_cost?: number | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('custom_trading_post_pricing')
      .insert({
        user_id: user.id,
        custom_trading_post_equipment_id: equipmentItemId,
        gang_type_id: data.gang_type_id || null,
        custom_gang_type_id: data.custom_gang_type_id || null,
        gang_origin_id: data.gang_origin_id || null,
        fighter_type_id: data.fighter_type_id || null,
        adjusted_cost: data.adjusted_cost ?? null,
      });

    if (error) {
      console.error('Error adding pricing rule:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in addPricingRule:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deletePricingRule(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('custom_trading_post_pricing')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting pricing rule:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in deletePricingRule:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Batch save rules (delete all + re-insert)
// ---------------------------------------------------------------------------

export async function saveEquipmentRules(
  equipmentItemId: string,
  availabilityRules: Array<{
    gang_type_id?: string | null;
    custom_gang_type_id?: string | null;
    gang_origin_id?: string | null;
    gang_variant_id?: string | null;
    campaign_type_allegiance_id?: string | null;
    alignment?: string | null;
    availability?: string | null;
  }>,
  pricingRules: Array<{
    gang_type_id?: string | null;
    custom_gang_type_id?: string | null;
    gang_origin_id?: string | null;
    fighter_type_id?: string | null;
    adjusted_cost?: number | null;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error: deleteAvailError } = await supabase
      .from('custom_trading_post_availability')
      .delete()
      .eq('custom_trading_post_equipment_id', equipmentItemId)
      .eq('user_id', user.id);

    if (deleteAvailError) throw deleteAvailError;

    const { error: deletePricingError } = await supabase
      .from('custom_trading_post_pricing')
      .delete()
      .eq('custom_trading_post_equipment_id', equipmentItemId)
      .eq('user_id', user.id);

    if (deletePricingError) throw deletePricingError;

    if (availabilityRules.length > 0) {
      const { error } = await supabase
        .from('custom_trading_post_availability')
        .insert(
          availabilityRules.map(r => ({
            user_id: user.id,
            custom_trading_post_equipment_id: equipmentItemId,
            gang_type_id: r.gang_type_id || null,
            custom_gang_type_id: r.custom_gang_type_id || null,
            gang_origin_id: r.gang_origin_id || null,
            gang_variant_id: r.gang_variant_id || null,
            campaign_type_allegiance_id: r.campaign_type_allegiance_id || null,
            alignment: r.alignment || null,
            availability: r.availability || null,
          }))
        );
      if (error) throw error;
    }

    if (pricingRules.length > 0) {
      const { error } = await supabase
        .from('custom_trading_post_pricing')
        .insert(
          pricingRules.map(r => ({
            user_id: user.id,
            custom_trading_post_equipment_id: equipmentItemId,
            gang_type_id: r.gang_type_id || null,
            custom_gang_type_id: r.custom_gang_type_id || null,
            gang_origin_id: r.gang_origin_id || null,
            fighter_type_id: r.fighter_type_id || null,
            adjusted_cost: r.adjusted_cost ?? null,
          }))
        );
      if (error) throw error;
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in saveEquipmentRules:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
