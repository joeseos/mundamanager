import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

enum GangAlignment {
  LAW_ABIDING = 'Law Abiding',
  OUTLAW = 'Outlaw'
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { 
    name,
    credits, 
    operation, 
    alignment,
    reputation,
    meat,
    exploration_points,
    note
  } = await request.json();

  try {
    // Prepare update object
    const updates: any = {
      last_updated: new Date().toISOString()
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
          { error: "Invalid alignment value. Must be 'Law Abiding' or 'Outlaw'" }, 
          { status: 400 }
        );
      }
      updates.alignment = alignment;
    }

    // Add reputation if provided
    if (reputation !== undefined) {
      updates.reputation = reputation;
    }

    // Add meat if provided
    if (meat !== undefined) {
      updates.meat = meat;
    }

    // Add exploration points if provided
    if (exploration_points !== undefined) {
      updates.exploration_points = exploration_points;
    }

    // Add credits if provided
    if (credits !== undefined && operation) {
      const { data: currentGang, error: gangFetchError } = await supabase
        .from("gangs")
        .select('credits')
        .eq('id', params.id)
        .single();

      if (gangFetchError) throw gangFetchError;

      updates.credits = operation === 'add' 
        ? (currentGang.credits || 0) + credits
        : (currentGang.credits || 0) - credits;
    }

    // Perform the update
    const { data: updatedGang, error: gangUpdateError } = await supabase
      .from("gangs")
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (gangUpdateError) throw gangUpdateError;

    return NextResponse.json(updatedGang);
  } catch (error) {
    console.error("Error updating gang:", error);
    return NextResponse.json({ error: "Failed to update gang" }, { status: 500 });
  }
}
