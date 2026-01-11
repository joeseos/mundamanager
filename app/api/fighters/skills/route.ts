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

    // Create Supabase client
    const supabase = await createClient();

    // Get the fighter owner's user_id
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('user_id')
      .eq('id', fighter_id)
      .single();

    if (fighterError || !fighter) {
      return new Response(JSON.stringify({ error: 'Fighter not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Insert the skill with fighter owner's user_id
    const { data, error } = await supabase
      .from('fighter_skills')
      .insert({
        fighter_id,
        skill_id,
        is_advance,
        xp_cost,
        credits_increase,
        user_id: fighter.user_id
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