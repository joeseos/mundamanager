'use server'

import { eq } from 'drizzle-orm';
import { invalidateGangPositioning } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from "@/utils/auth";
import { clientErrorMessage, withUserWrite } from '@/utils/db/client';
import { gangs } from '@/utils/db/schema';

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

    // Authorization is enforced by RLS policies on gangs table: a gang the user
    // may not edit matches no row, the same as a missing one.
    const updated = await withUserWrite(user.id, (tx) =>
      tx
        .update(gangs)
        .set({ positioning: params.positions })
        .where(eq(gangs.id, params.gangId))
        .returning({ id: gangs.id })
    );

    if (updated.length === 0) {
      return {
        success: false,
        error: 'Gang not found'
      };
    }

    // Invalidate relevant cache tags
    // Positioning now has its own dedicated cache
    invalidateGangPositioning(params.gangId);
    // NOTE: No need to invalidate COMPOSITE_GANG_FIGHTERS_LIST - gang page uses BASE_GANG_POSITIONING

    return { success: true };
  } catch (error) {
    console.error('Error in updateGangPositioning server action:', error);
    return {
      success: false,
      error: clientErrorMessage(error, 'Failed to update fighter positions')
    };
  }
}
