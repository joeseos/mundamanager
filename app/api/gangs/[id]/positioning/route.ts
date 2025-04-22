import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  
  try {
    // Create Supabase client
    const supabase = await createClient();
    
    if (!supabase) {
      console.error("Supabase client could not be created");
      return NextResponse.json(
        { error: 'Authentication service unavailable' },
        { status: 500 }
      );
    }
    
    // Check if authenticated - use getUser() instead of getSession() for server-side code
    const { data, error: authError } = await supabase.auth.getUser();
    const user = data?.user;
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }
    
    console.log("Authenticated as user ID:", user.id);
    
    // First - check if the gang exists and who owns it
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, id')
      .eq('id', params.id)
      .single();
    
    if (gangError) {
      console.error("Gang fetch error:", gangError);
      return NextResponse.json(
        { error: 'Gang not found' },
        { status: 404 }
      );
    }
    
    console.log("Gang owner ID:", gang.user_id);
    console.log("Is owner match:", user.id === gang.user_id);
    
    // Parse the request body
    const { positions } = await request.json();
    
    // Log the update attempt
    console.log("Attempting update on gang:", params.id);
    console.log("With positions data:", positions);
    
    // Try the update
    const { error: updateError } = await supabase
      .from('gangs')
      .update({ positioning: positions })
      .eq('id', params.id);
    
    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json(
        { error: 'Update failed', details: updateError.message },
        { status: 403 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Exception:", error);
    return NextResponse.json(
      { error: 'Failed to update positions', details: String(error) },
      { status: 500 }
    );
  }
}