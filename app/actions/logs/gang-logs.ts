'use server'

import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

export interface CreateGangLogParams {
  gang_id: string;
  action_type: string;
  description: string;
  fighter_id?: string;
  vehicle_id?: string;
  user_id?: string;
}

export interface GangLogActionResult {
  success: boolean;
  error?: string;
}

export async function createGangLog(params: CreateGangLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();

    // Claims are verified locally; getUser() would be a network round trip per log write
    const userId = params.user_id || await getUserIdFromClaims(supabase);

    if (!userId) {
      throw new Error('User not authenticated');
    }

    // No .select(): RETURNING would also apply the SELECT policy, which campaign
    // members fail for an opponent's gang even though the INSERT policy lets
    // them log there (battle results, territory claims), rolling the insert back.
    const { error } = await supabase
      .from('gang_logs')
      .insert({
        gang_id: params.gang_id,
        user_id: userId,
        action_type: params.action_type,
        description: params.description,
        fighter_id: params.fighter_id || null,
        vehicle_id: params.vehicle_id || null,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error creating gang log:', error);
      throw new Error(error.message || 'Failed to create gang log');
    }

    return { success: true };
  } catch (error) {
    console.error('Error in createGangLog server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create gang log'
    };
  }
}