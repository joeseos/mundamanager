import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fighter_id, skill_id, is_advance, xp_cost, credits_increase } = body;
    
    // Validate the is_advance flag
    if (typeof is_advance !== 'boolean') {
      return new Response(JSON.stringify({ error: 'is_advance must be a boolean' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create Supabase client and insert the skill
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('fighter_skills')
      .insert({
        fighter_id,
        skill_id,
        is_advance,
        xp_cost,
        credits_increase
      })
      .select();
    
    if (error) throw error;
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error adding fighter skill:', error);
    return new Response(JSON.stringify({ error: 'Failed to add skill' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 