import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { CACHE_TAGS, invalidateGangCredits } from '@/utils/cache-tags';
import { revalidateTag } from 'next/cache';
import { getUserIdFromClaims } from "@/utils/auth";

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
      .maybeSingle();

    if (gangError) throw gangError;

    if (!gangData) {
      return NextResponse.json(
        { error: "Gang not found" },
        { status: 404 }
      );
    }

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
        .select(`
          campaign_id,
          role,
          status,
          campaign:campaign_id (
            campaign_name
          )
        `)
        .eq('gang_id', gangData.id);
      if (!campaignError && campaignData) {
        // Flatten the nested campaign data
        campaigns = campaignData.map(cg => ({
          campaign_id: cg.campaign_id,
          campaign_name: (cg.campaign as any)?.campaign_name,
          role: cg.role,
          status: cg.status
        }));
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
    note,
    note_backstory,
    note_private,
    vehicleId,
    vehicle_name,
    special_rules,
    gang_variants
  } = await request.json();

  try {
    // Get the current user using server-side auth
    const userId = await getUserIdFromClaims(supabase);

    if (!userId) {
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
    
    // Track what changed for cache invalidation
    let creditsChanged = false;
    let notesChanged = false;

    // Add name if provided
    if (name !== undefined) {
      updates.name = name.trimEnd();
    }

    // Add note if provided
    if (note !== undefined) {
      updates.note = note;
      notesChanged = true;
    }

    // Add note_backstory if provided
    if (note_backstory !== undefined) {
      updates.note_backstory = note_backstory;
      notesChanged = true;
    }

    // Add note_private if provided
    if (note_private !== undefined) {
      updates.note_private = note_private;
      updates.note_private_updated_at = new Date().toISOString();
      notesChanged = true;
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

    // Adjust credits and/or reputation if needed
    if (
      (credits !== undefined && credits_operation) ||
      (reputation !== undefined && reputation_operation)
    ) {
      const { data: currentGang, error: gangFetchError } = await supabase
        .from("gangs")
        .select("credits, reputation")
        .eq("id", params.id)
        .single();

      if (gangFetchError) throw gangFetchError;

      if (credits !== undefined && credits_operation) {
        updates.credits = credits_operation === 'add'
          ? (currentGang.credits || 0) + credits
          : (currentGang.credits || 0) - credits;
        creditsChanged = true;
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

    // Perform the update
    const { data: updatedGang, error: gangUpdateError } = await supabase
      .from("gangs")
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (gangUpdateError) throw gangUpdateError;

    // Granular cache invalidation based on what changed

    // Invalidate credits cache if credits were changed
    if (creditsChanged) {
      invalidateGangCredits(params.id);
    }

    // Invalidate gang basic data if name, alignment, color, alliance, or notes changed
    if (name !== undefined || alignment !== undefined || gang_colour !== undefined ||
        alliance_id !== undefined || notesChanged) {
      revalidateTag(CACHE_TAGS.BASE_GANG_BASIC(params.id), { expire: 0 });
      revalidateTag(CACHE_TAGS.SHARED_GANG_BASIC_INFO(params.id), { expire: 0 });
    }

    // Invalidate gang variants if changed
    if (gang_variants !== undefined) {
      revalidateTag(CACHE_TAGS.GANG_FIGHTER_TYPES(params.id), { expire: 0 });
    }

    // NOTE: No need to invalidate COMPOSITE_GANG_FIGHTERS_LIST - gang page uses granular tags

    return NextResponse.json(updatedGang);
  } catch (error) {
    console.error("Error updating gang:", error);
    return NextResponse.json({ error: "Failed to update gang" }, { status: 500 });
  }
}
