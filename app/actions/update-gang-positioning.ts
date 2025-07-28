'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";

interface UpdateGangPositioningParams {
  gangId: string;
  positions: Record<number, string>;
}

interface UpdateGangPositioningResult {
  success: boolean;
  error?: string;
}

export async function updateGangPositioning(params: UpdateGangPositioningParams): Promise<UpdateGangPositioningResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        success: false,
        error: 'Authentication failed'
      };
    }

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase);
    
    // Get gang information to verify ownership
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, id')
      .eq('id', params.gangId)
      .single();
    
    if (gangError || !gang) {
      return {
        success: false,
        error: 'Gang not found'
      };
    }

    // Check permissions - if not admin, must be gang owner
    if (!isAdmin && gang.user_id !== user.id) {
      return {
        success: false,
        error: 'You do not have permission to update this gang\'s positioning'
      };
    }

    // Update gang positioning
    const { error: updateError } = await supabase
      .from('gangs')
      .update({ positioning: params.positions })
      .eq('id', params.gangId);
    
    if (updateError) {
      console.error('Update positioning error:', updateError);
      return {
        success: false,
        error: `Update failed: ${updateError.message}`
      };
    }

    // Invalidate relevant cache tags
    // Positioning now has its own dedicated cache
    revalidateTag(CACHE_TAGS.BASE_GANG_POSITIONING(params.gangId));
    // Also invalidate composite gang data since positioning affects gang display
    revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId));

    return { success: true };
  } catch (error) {
    console.error('Error in updateGangPositioning server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}