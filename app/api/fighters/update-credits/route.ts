import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = createClient();

  const { fighter_id, amount } = await request.json();

  if (!fighter_id || amount === undefined) {
    return NextResponse.json({ error: "Missing fighter_id or amount" }, { status: 400 });
  }

  try {
    // First get current credits
    const { data: fighter, error: fetchError } = await supabase
      .from('fighters')
      .select('credits')
      .eq('id', fighter_id)
      .single();

    if (fetchError) throw fetchError;

    // Calculate new credits value
    const newCredits = Math.max(0, fighter.credits - amount);

    // Update with new value
    const { data, error: updateError } = await supabase
      .from('fighters')
      .update({ credits: newCredits })
      .eq('id', fighter_id)
      .select('credits')
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ message: "Credits updated successfully", credits: data.credits }, { status: 200 });
  } catch (error) {
    console.error("Error updating fighter credits:", error);
    return NextResponse.json({ error: "Failed to update fighter credits" }, { status: 500 });
  }
}