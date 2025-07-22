'use server';

import { createClient } from '@/utils/supabase/server';

// Types for gang log operations
export interface GangLogParams {
  gang_id: string;
  action_type: string;
  description: string;
  fighter_id?: string;
  vehicle_id?: string;
}

export interface GangLogResult {
  success: boolean;
  log_id?: string;
  error?: string;
}

// Core gang logging function
export async function createGangLog(params: GangLogParams): Promise<GangLogResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    // Insert the gang log
    const { data, error } = await supabase
      .from('gang_logs')
      .insert({
        gang_id: params.gang_id,
        user_id: user.id,
        action_type: params.action_type,
        description: params.description,
        fighter_id: params.fighter_id || null,
        vehicle_id: params.vehicle_id || null,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating gang log:', error);
      return { success: false, error: error.message };
    }

    return { success: true, log_id: data.id };

  } catch (error) {
    console.error('Error in createGangLog:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

// Specialized logging functions for different event types

export async function logAdvancementPurchase(
  gang_id: string,
  fighter_id: string,
  advancement_name: string,
  advancement_type: 'characteristic' | 'skill',
  xp_cost: number,
  credits_increase: number
): Promise<GangLogResult> {
  const description = `Fighter purchased ${advancement_name} ${advancement_type} advancement for ${xp_cost} XP (${credits_increase} credits)`;
  
  return createGangLog({
    gang_id,
    action_type: 'advancement_purchased',
    description,
    fighter_id
  });
}

export async function logFighterAdded(
  gang_id: string,
  fighter_id: string,
  fighter_name: string,
  fighter_cost: number,
  new_gang_rating: number
): Promise<GangLogResult> {
  const description = `Added fighter "${fighter_name}" (${fighter_cost} credits). New gang rating: ${new_gang_rating}`;
  
  return createGangLog({
    gang_id,
    action_type: 'fighter_added',
    description,
    fighter_id
  });
}

export async function logEquipmentPurchase(
  gang_id: string,
  fighter_id: string,
  fighter_name: string,
  equipment_name: string,
  cost: number,
  new_gang_rating: number
): Promise<GangLogResult> {
  const description = `Fighter "${fighter_name}" bought ${equipment_name} for ${cost} credits. New gang rating: ${new_gang_rating}`;
  
  return createGangLog({
    gang_id,
    action_type: 'equipment_purchased',
    description,
    fighter_id
  });
}

export async function logEquipmentSale(
  gang_id: string,
  fighter_id: string,
  fighter_name: string,
  equipment_name: string,
  sale_price: number,
  new_gang_rating: number
): Promise<GangLogResult> {
  const description = `Fighter "${fighter_name}" sold ${equipment_name} for ${sale_price} credits. New gang rating: ${new_gang_rating}`;
  
  return createGangLog({
    gang_id,
    action_type: 'equipment_sold',
    description,
    fighter_id
  });
}

export async function logVehicleAdded(
  gang_id: string,
  vehicle_id: string,
  vehicle_name: string,
  cost: number,
  assigned_fighter_id?: string,
  assigned_fighter_name?: string,
  new_gang_rating?: number
): Promise<GangLogResult> {
  let description = `Added vehicle "${vehicle_name}" (${cost} credits)`;
  
  if (assigned_fighter_id && assigned_fighter_name) {
    description += ` assigned to fighter "${assigned_fighter_name}"`;
  } else {
    description += ' (unassigned)';
  }
  
  if (new_gang_rating !== undefined) {
    description += `. New gang rating: ${new_gang_rating}`;
  }
  
  return createGangLog({
    gang_id,
    action_type: 'vehicle_added',
    description,
    fighter_id: assigned_fighter_id,
    vehicle_id
  });
}

export async function logCreditsChanged(
  gang_id: string,
  old_credits: number,
  new_credits: number,
  reason?: string
): Promise<GangLogResult> {
  const change_type = new_credits > old_credits ? 'earned' : 'spent';
  let description = `Credits ${change_type === 'earned' ? 'increased' : 'decreased'} from ${old_credits} to ${new_credits}`;
  
  if (reason) {
    description += ` (${reason})`;
  }
  
  return createGangLog({
    gang_id,
    action_type: `credits_${change_type}`,
    description
  });
}

export async function logFighterStatusChange(
  gang_id: string,
  fighter_id: string,
  fighter_name: string,
  status: 'killed' | 'retired' | 'enslaved'
): Promise<GangLogResult> {
  const description = `Fighter "${fighter_name}" was ${status}`;
  
  return createGangLog({
    gang_id,
    action_type: `fighter_${status}`,
    description,
    fighter_id
  });
}

export async function logXpChange(
  gang_id: string,
  fighter_id: string,
  fighter_name: string,
  old_xp: number,
  new_xp: number,
  reason?: string
): Promise<GangLogResult> {
  let description = `Fighter "${fighter_name}" XP changed from ${old_xp} to ${new_xp}`;
  
  if (reason) {
    description += ` (${reason})`;
  }
  
  return createGangLog({
    gang_id,
    action_type: 'fighter_xp_changed',
    description,
    fighter_id
  });
}

// Generic function for custom log entries
export async function logCustomEvent(
  gang_id: string,
  action_type: string,
  description: string,
  fighter_id?: string,
  vehicle_id?: string
): Promise<GangLogResult> {
  return createGangLog({
    gang_id,
    action_type,
    description,
    fighter_id,
    vehicle_id
  });
} 