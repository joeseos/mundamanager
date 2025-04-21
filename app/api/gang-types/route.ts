import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const { data: gangTypes, error } = await supabase
      .from('gang_types')
      .select('gang_type')

    if (error) throw error;

    return NextResponse.json(gangTypes)
  } catch (error) {
    console.error('Error fetching gang types:', error)
    return NextResponse.json({ error: 'Error fetching gang types' }, { status: 500 })
  }
}