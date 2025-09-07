'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";

// Type-safe server function patterns for Next.js + TanStack Query integration
export type ServerFunctionResult<T = unknown> = {
  success: true
  data: T
} | {
  success: false
  error: string
}

export interface ServerFunctionContext {
  user: any  // AuthUser type from supabase
  supabase: any
}

// Helper function to create server function context
async function createServerContext(): Promise<ServerFunctionContext> {
  const supabase = await createClient()
  const user = await getAuthenticatedUser(supabase)
  
  return {
    user,
    supabase
  }
}

export interface UpdateGangPositioningParams {
  gangId: string;
  positions: Record<number, string>;
}

export interface UpdateGangPositioningResult {
  positioning: Record<number, string>;
  gangId: string;
}

export async function updateGangPositioning(params: UpdateGangPositioningParams): Promise<ServerFunctionResult<UpdateGangPositioningResult>> {
  try {
    const { user, supabase } = await createServerContext();
    
    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);
    
    // Get gang information to verify ownership
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, id')
      .eq('id', params.gangId)
      .single();
    
    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    // Check permissions - if not admin, must be gang owner
    if (!isAdmin && gang.user_id !== user.id) {
      throw new Error('You do not have permission to update this gang\'s positioning');
    }

    // Update gang positioning
    const { data: updatedGang, error: updateError } = await supabase
      .from('gangs')
      .update({ positioning: params.positions })
      .eq('id', params.gangId)
      .select('positioning, id')
      .single();
    
    if (updateError) {
      console.error('Update positioning error:', updateError);
      throw new Error(`Update failed: ${updateError.message}`);
    }

    // Invalidate relevant cache tags
    // Positioning now has its own dedicated cache
    revalidateTag(CACHE_TAGS.BASE_GANG_POSITIONING(params.gangId));
    // Also invalidate composite gang data since positioning affects gang display
    revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(params.gangId));

    return {
      success: true,
      data: {
        positioning: updatedGang.positioning || {},
        gangId: updatedGang.id
      }
    };
  } catch (error) {
    console.error('Error in updateGangPositioning server function:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}