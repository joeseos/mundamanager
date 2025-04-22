import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  try {
    const { data: territories, error } = await supabase
      .from('territories')
      .select('id, territory_name, campaign_type_id');

    if (error) throw error;

    return NextResponse.json(territories);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch territories" }, 
      { status: 500 }
    );
  }
} 