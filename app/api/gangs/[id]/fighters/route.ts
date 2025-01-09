import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fighter_type } = await request.json();

  if (!fighter_type) {
    return NextResponse.json({ error: "Fighter type is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("fighters")
      .insert([
        { 
          gang_id: params.id,
          fighter_type,
        },
      ])
      .select();

    if (error) throw error;

    return NextResponse.json(data[0]);
  } catch (error) {
    console.error('Error adding fighter:', error);
    return NextResponse.json({ error: "Failed to add fighter" }, { status: 500 });
  }
}