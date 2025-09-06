'use server'

import { createClient } from "@/utils/supabase/server";

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
  data?: any;
  error?: string;
}

export async function createGangLog(params: CreateGangLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Use user_id from params or fallback to current user
    const userId = params.user_id || user.id;

    // Insert gang log using the SECURITY DEFINER function to bypass RLS
    const { data, error } = await supabase.rpc('gang_logs', {
      p_gang_id: params.gang_id,
      p_action_type: params.action_type,
      p_description: params.description,
      p_fighter_id: params.fighter_id || null,
      p_vehicle_id: params.vehicle_id || null
    });

    if (error) {
      console.error('Error creating gang log:', error);
      throw new Error(error.message || 'Failed to create gang log');
    }

    return { 
      success: true, 
      data: { id: data } // The RPC function returns the log ID
    };
  } catch (error) {
    console.error('Error in createGangLog server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create gang log'
    };
  }
}