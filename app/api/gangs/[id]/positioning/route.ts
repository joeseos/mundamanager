import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  
  try {
    const { positions }: { positions: Record<number, string> } = await request.json();
    
    // Validate that positions is properly formatted
    if (!positions || typeof positions !== 'object') {
      throw new Error('Invalid positions format');
    }

    // Ensure all keys are numbers and all values are strings
    Object.entries(positions).forEach(([pos, id]) => {
      if (isNaN(Number(pos)) || typeof id !== 'string') {
        throw new Error('Invalid position data types');
      }
    });

    const { error } = await supabase
      .from('gangs')
      .update({ positioning: positions })
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update positions' },
      { status: 500 }
    );
  }
} 