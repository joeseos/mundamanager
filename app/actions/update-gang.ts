'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

interface UpdateGangParams {
  gang_id: string;
  name?: string;
  credits?: number;
  credits_operation?: 'add' | 'subtract';
  alignment?: string;
  gang_colour?: string;
  alliance_id?: string | null;
  reputation?: number;
  reputation_operation?: 'add' | 'subtract';
  meat?: number;
  scavenging_rolls?: number;
  exploration_points?: number;
  gang_variants?: string[];
  note?: string;
}

interface UpdateGangResult {
  success: boolean;
  data?: {
    gang_id: string;
    name: string;
    credits: number;
    reputation: number;
    meat: number;
    scavenging_rolls: number;
    exploration_points: number;
    alignment: string;
    alliance_id: string | null;
    alliance_name?: string;
    gang_colour: string;
    last_updated: string;
    gang_variants: Array<{id: string, variant: string}>;
  };
  error?: string;
}

export async function updateGang(params: UpdateGangParams): Promise<UpdateGangResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get gang information (RLS will handle permissions)
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, user_id, credits, reputation')
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

    // Add meat if provided
    if (params.meat !== undefined) {
      updates.meat = params.meat;
    }

    // Add scavenging rolls if provided
    if (params.scavenging_rolls !== undefined) {
      updates.scavenging_rolls = params.scavenging_rolls;
    }

    // Add exploration points if provided
    if (params.exploration_points !== undefined) {
      updates.exploration_points = params.exploration_points;
    }

    // Handle credits and reputation changes
    if (
      (params.credits !== undefined && params.credits_operation) ||
      (params.reputation !== undefined && params.reputation_operation)
    ) {
      if (params.credits !== undefined && params.credits_operation) {
        updates.credits = params.credits_operation === 'add'
          ? (gang.credits || 0) + params.credits
          : (gang.credits || 0) - params.credits;
        creditsChanged = true;
      }

      if (params.reputation !== undefined && params.reputation_operation) {
        updates.reputation = params.reputation_operation === 'add'
          ? (gang.reputation || 0) + params.reputation
          : (gang.reputation || 0) - params.reputation;
      }
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
        meat,
        scavenging_rolls,
        exploration_points,
        alignment,
        alliance_id,
        gang_colour,
        last_updated
      `)
      .single();

    if (gangUpdateError) {
      throw new Error(`Failed to update gang: ${gangUpdateError.message}`);
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

    // Targeted cache invalidation
    revalidateTag(CACHE_TAGS.GANG_OVERVIEW(params.gang_id));
    
    if (creditsChanged) {
      revalidateTag(CACHE_TAGS.GANG_CREDITS(params.gang_id));
    }

    // NEW: Invalidate campaign caches if this gang is in any campaigns
    const { data: campaignGangs, error: campaignGangsError } = await supabase
      .from('campaign_gangs')
      .select('campaign_id')
      .eq('gang_id', params.gang_id);
    if (!campaignGangsError && campaignGangs && campaignGangs.length > 0) {
      for (const cg of campaignGangs) {
        const campaignId = cg.campaign_id;
        revalidateTag(`campaign-basic-${campaignId}`);
        revalidateTag(`campaign-members-${campaignId}`);
        revalidateTag(`campaign-territories-${campaignId}`);
        revalidateTag(`campaign-battles-${campaignId}`);
        revalidateTag(`campaign-${campaignId}`);
      }
    }

    return {
      success: true,
      data: {
        gang_id: updatedGang.id,
        name: updatedGang.name,
        credits: updatedGang.credits,
        reputation: updatedGang.reputation,
        meat: updatedGang.meat,
        scavenging_rolls: updatedGang.scavenging_rolls,
        exploration_points: updatedGang.exploration_points,
        alignment: updatedGang.alignment,
        alliance_id: updatedGang.alliance_id,
        alliance_name: allianceName || undefined,
        gang_colour: updatedGang.gang_colour,
        last_updated: updatedGang.last_updated,
        gang_variants: gangVariants
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