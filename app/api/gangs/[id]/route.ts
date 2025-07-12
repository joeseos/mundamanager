import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

enum GangAlignment {
  LAW_ABIDING = 'Law Abiding',
  OUTLAW = 'Outlaw',
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();

  try {
    // Get gang data with all related information, including variant names
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select(
        `
        *,
        campaigns:campaign_gangs(
          campaign_id, 
          campaign_name,
          role,
          status,
          has_meat,
          has_exploration_points,
          has_scavenging_rolls
        ),
        gang_variants!inner(
          gang_variant_types(id, variant)
        )
      `
      )
      .eq('id', params.id)
      .single();

    if (gangError) throw gangError;

    // Process the gang data to include variant names
    const processedGangData = {
      ...gangData,
      gang_variants: gangData.gang_variants.map((v: any) => ({
        id: v.gang_variant_types.id,
        variant: v.gang_variant_types.variant,
      })),
    };

    return NextResponse.json({ gang: processedGangData });
  } catch (error) {
    console.error('Error fetching gang data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang data' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
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
    gang_variants,
  } = await request.json();

  try {
    // Get the current user using server-side auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For vehicle name updates
    if (operation === 'update_vehicle_name') {
      // Define the type of updateData to include special_rules
      const updateData: {
        vehicle_name: string;
        special_rules?: string[];
      } = {
        vehicle_name,
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
        updatedSpecialRules: special_rules !== undefined,
      });
    }

    // Prepare update object
    const updates: any = {
      last_updated: new Date().toISOString(),
    };

    // Add name if provided
    if (name !== undefined) {
      updates.name = name;
    }

    // Add note if provided
    if (note !== undefined) {
      updates.note = note;
    }

    // Add alignment if provided
    if (alignment !== undefined) {
      if (!['Law Abiding', 'Outlaw'].includes(alignment)) {
        return NextResponse.json(
          {
            error: "Invalid alignment value. Must be 'Law Abiding' or 'Outlaw'",
          },
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
      const { data: currentGang, error: gangFetchError } = await supabase
        .from('gangs')
        .select('credits, reputation')
        .eq('id', params.id)
        .single();

      if (gangFetchError) throw gangFetchError;

      if (credits !== undefined && credits_operation) {
        updates.credits =
          credits_operation === 'add'
            ? (currentGang.credits || 0) + credits
            : (currentGang.credits || 0) - credits;
      }

      if (reputation !== undefined && reputation_operation) {
        updates.reputation =
          reputation_operation === 'add'
            ? (currentGang.reputation || 0) + reputation
            : (currentGang.reputation || 0) - reputation;
      }
    }

    if (gang_variants !== undefined) {
      updates.gang_variants = gang_variants;
    }

    // Perform the update
    const { data: updatedGang, error: gangUpdateError } = await supabase
      .from('gangs')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (gangUpdateError) throw gangUpdateError;

    return NextResponse.json(updatedGang);
  } catch (error) {
    console.error('Error updating gang:', error);
    return NextResponse.json(
      { error: 'Failed to update gang' },
      { status: 500 }
    );
  }
}
