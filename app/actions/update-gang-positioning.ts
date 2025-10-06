'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
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
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);
    
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

    // Note: Authorization is enforced by RLS policies on gangs table

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
    // NOTE: No need to invalidate COMPOSITE_GANG_FIGHTERS_LIST - gang page uses BASE_GANG_POSITIONING

    return { success: true };
  } catch (error) {
    console.error('Error in updateGangPositioning server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}