import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { CACHE_TAGS } from '@/utils/cache-tags';
import { revalidateTag } from 'next/cache';
import { checkAdmin } from "@/utils/auth";
import { logCreditsChanged, logCustomEvent } from '@/app/actions/gang-logs';

enum GangAlignment {
  LAW_ABIDING = 'Law Abiding',
  OUTLAW = 'Outlaw'
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  try {
    // Get gang data (no join on gang_variants)
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('*')
      .eq('id', params.id)
      .single();

    if (gangError) throw gangError;

    // Fetch variant details if gang_variants is present and is an array
    let variantDetails: any[] = [];
    if (gangData.gang_variants && Array.isArray(gangData.gang_variants)) {
      const { data: variants, error: variantsError } = await supabase
        .from('gang_variant_types')
        .select('id, variant')
        .in('id', gangData.gang_variants);
      if (variantsError) throw variantsError;
      variantDetails = variants;
    }

    // Optionally, fetch campaigns as before (if needed)
    let campaigns: any[] = [];
    if (gangData.id) {
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaign_gangs')
        .select('campaign_id, campaign_name, role, status, has_meat, has_exploration_points, has_scavenging_rolls')
        .eq('gang_id', gangData.id);
      if (!campaignError && campaignData) {
        campaigns = campaignData;
      }
    }

    // Return gang with variant details and campaigns
    return NextResponse.json({
      gang: {
        ...gangData,
        gang_variants: variantDetails,
        campaigns,
      }
    });
  } catch (error) {
    console.error('Error fetching gang data:', error);
    return NextResponse.json(
      { error: "Failed to fetch gang data" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { 
    name,
    operation,
    credits,
    credits_operation,
    alignment,
    gang_colour,
    alliance_id,
    reputation,
    reputation_operation,
    meat,
    scavenging_rolls,
    exploration_points,
    note,
    vehicleId,
    vehicle_name,
    special_rules,
    gang_variants
  } = await request.json();

  try {
    // Get the current user using server-side auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // For vehicle name updates
    if (operation === 'update_vehicle_name') {
      // Define the type of updateData to include special_rules
      const updateData: { 
        vehicle_name: string; 
        special_rules?: string[]; 
      } = { 
        vehicle_name: vehicle_name.trimEnd()
      };
      
      // Only include special_rules if they were provided
      if (special_rules !== undefined) {
        updateData.special_rules = special_rules;
      }
      
      const { error: updateError } = await supabase
        .from('vehicles')
        .update(updateData)
        .eq('id', vehicleId)
        .eq('gang_id', params.id);

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update vehicle' },
          { status: 500 }
        );
      }

      return NextResponse.json({ 
        success: true,
        updatedSpecialRules: special_rules !== undefined
      });
    }

    // Prepare update object
    const updates: any = {
      last_updated: new Date().toISOString()
    };

    // Fetch the current gang data for comparison and logging
    const { data: currentGang, error: gangFetchError } = await supabase
      .from("gangs")
      .select("id, user_id, credits, reputation, meat, exploration_points, name, alignment, gang_colour, alliance_id")
      .eq("id", params.id)
      .single();

    if (gangFetchError) throw gangFetchError;

    // Add name if provided
    if (name !== undefined) {
      updates.name = name.trimEnd();
    }

    // Add note if provided
    if (note !== undefined) {
      updates.note = note;
    }

    // Add alignment if provided
    if (alignment !== undefined) {
      if (!['Law Abiding', 'Outlaw'].includes(alignment)) {
        return NextResponse.json(
          { error: "Invalid alignment value. Must be 'Law Abiding' or 'Outlaw'" }, 
          { status: 400 }
        );
      }
      updates.alignment = alignment;
    }

    // Add gang_colour if provided
    if (gang_colour !== undefined) {
      updates.gang_colour = gang_colour;
    }

    // Add alliance_id if provided
    if (alliance_id !== undefined) {
      updates.alliance_id = alliance_id;
    }

    // Add meat if provided
    if (meat !== undefined) {
      updates.meat = meat;
    }

    // Add scavenging rolls if provided
    if (scavenging_rolls !== undefined) {
      updates.scavenging_rolls = scavenging_rolls;
    }

    // Add exploration points if provided
    if (exploration_points !== undefined) {
      updates.exploration_points = exploration_points;
    }

    // Adjust credits and/or reputation if needed
    if (
      (credits !== undefined && credits_operation) ||
      (reputation !== undefined && reputation_operation)
    ) {
      if (credits !== undefined && credits_operation) {
        updates.credits = credits_operation === 'add'
          ? (currentGang.credits || 0) + credits
          : (currentGang.credits || 0) - credits;
      }

      if (reputation !== undefined && reputation_operation) {
        updates.reputation = reputation_operation === 'add'
          ? (currentGang.reputation || 0) + reputation
          : (currentGang.reputation || 0) - reputation;
      }
    }

    if (gang_variants !== undefined) {
      updates.gang_variants = gang_variants;
    }

    // Update the gang
    const { data: updatedGang, error: updateError } = await supabase
      .from("gangs")
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Add gang logging for changes (matching server action logging)
    
    // Log credits changes (if manually updated)
    if (credits !== undefined && credits_operation && currentGang.credits !== updatedGang.credits) {
      await logCreditsChanged(
        params.id,
        currentGang.credits,
        updatedGang.credits,
        'Manual gang update (API)'
      );
    }

    // Log reputation changes
    if (reputation !== undefined && reputation_operation && currentGang.reputation !== updatedGang.reputation) {
      await logCustomEvent(
        params.id,
        'reputation_changed',
        `Reputation changed from ${currentGang.reputation || 0} to ${updatedGang.reputation || 0}`
      );
    }

    // Log other field changes if they exist
    if (name !== undefined && currentGang.name !== updatedGang.name) {
      await logCustomEvent(
        params.id,
        'gang_name_changed',
        `Gang name changed from "${currentGang.name}" to "${updatedGang.name}"`
      );
    }

    if (alignment !== undefined && currentGang.alignment !== updatedGang.alignment) {
      await logCustomEvent(
        params.id,
        'alignment_changed',
        `Alignment changed from "${currentGang.alignment || 'None'}" to "${updatedGang.alignment || 'None'}"`
      );
    }

    // Invalidate cache for this gang so changes are reflected on reload
    revalidateTag(CACHE_TAGS.GANG_OVERVIEW(params.id));

    return NextResponse.json(updatedGang);
  } catch (error) {
    console.error("Error updating gang:", error);
    return NextResponse.json({ error: "Failed to update gang" }, { status: 500 });
  }
}
