'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";

export interface FighterLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  action_type: 'fighter_added' | 'fighter_removed' | 'fighter_killed' | 'fighter_retired' | 'fighter_enslaved' |
              'fighter_xp_changed' | 'fighter_total_xp_changed' | 'fighter_kills_changed' | 'fighter_cost_adjusted' |
              'fighter_rescued' | 'fighter_starved' | 'fighter_fed' | 'fighter_captured' | 'fighter_released' | 'fighter_copied';
  user_id?: string;
  old_value?: number | string;
  new_value?: number | string;
  fighter_credits?: number;
  status_reason?: 'killed' | 'retired' | 'enslaved' | null;
  source_fighter_name?: string;
  copy_type?: 'base' | 'experienced';
}

export async function logFighterAction(params: FighterLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    // Get current gang rating
    const { data: gangData, error: ratingError } = await supabase
      .from('gangs')
      .select('rating')
      .eq('id', params.gang_id)
      .single();

    if (ratingError) {
      console.error('Error fetching gang rating:', ratingError);
    }

    const newGangRating = gangData?.rating || 0;

    // Generate description based on action type
    let description: string;

    switch (params.action_type) {
      case 'fighter_added':
        description = `Added fighter "${params.fighter_name}" (${params.fighter_credits || 0} credits). New gang rating: ${newGangRating}`;
        break;
      case 'fighter_removed':
        const statusSuffix = params.status_reason ? ` (${params.status_reason})` : '';
        description = `Removed fighter "${params.fighter_name}" (${params.fighter_credits || 0} credits)${statusSuffix}. New gang rating: ${newGangRating}`;
        break;
      case 'fighter_killed':
        description = `Fighter "${params.fighter_name}" was killed`;
        break;
      case 'fighter_retired':
        description = `Fighter "${params.fighter_name}" retired`;
        break;
      case 'fighter_enslaved':
        description = `Fighter "${params.fighter_name}" was enslaved`;
        break;
      case 'fighter_xp_changed':
        description = `Fighter "${params.fighter_name}" XP changed from ${params.old_value || 0} to ${params.new_value || 0}`;
        break;
      case 'fighter_total_xp_changed':
        description = `Fighter "${params.fighter_name}" total XP changed from ${params.old_value || 0} to ${params.new_value || 0}`;
        break;
      case 'fighter_kills_changed':
        description = `Fighter "${params.fighter_name}" kills changed from ${params.old_value || 0} to ${params.new_value || 0}`;
        break;
      case 'fighter_cost_adjusted':
        description = `Fighter "${params.fighter_name}" cost adjustment changed from ${params.old_value || 0} to ${params.new_value || 0} credits. New gang rating: ${newGangRating}`;
        break;
      case 'fighter_rescued':
        description = `Fighter "${params.fighter_name}" was rescued from enslavement`;
        break;
      case 'fighter_starved':
        description = `Fighter "${params.fighter_name}" was starved`;
        break;
      case 'fighter_fed':
        description = `Fighter "${params.fighter_name}" was fed (1 meat consumed)`;
        break;
      case 'fighter_captured':
        description = `Fighter "${params.fighter_name}" was captured`;
        break;
      case 'fighter_released':
        description = `Fighter "${params.fighter_name}" was released from captivity`;
        break;
      case 'fighter_copied':
        const copyTypeLabel = params.copy_type === 'experienced' ? 'experienced fighter' : 'base fighter';
        const sourceInfo = params.source_fighter_name ? ` from "${params.source_fighter_name}"` : '';
        description = `Copied ${copyTypeLabel} "${params.fighter_name}"${sourceInfo} (${params.fighter_credits || 0} credits). New gang rating: ${newGangRating}`;
        break;
      default:
        throw new Error(`Unknown fighter action type: ${params.action_type}`);
    }

    return await createGangLog({
      gang_id: params.gang_id,
      action_type: params.action_type,
      description: description,
      fighter_id: params.fighter_id,
      user_id: params.user_id
    });

  } catch (error) {
    console.error('Error in logFighterAction:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to log fighter action'
    };
  }
}

// Helper function to calculate fighter total credits
export async function calculateFighterCredits(fighter_id: string): Promise<number> {
  try {
    const supabase = await createClient();
    
    const { data: fighter, error } = await supabase
      .from('fighters')
      .select(`
        credits,
        cost_adjustment,
        fighter_equipment!inner(purchase_cost),
        fighter_skills!inner(credits_increase),
        fighter_effects!inner(type_specific_data),
        vehicles!inner(cost, fighter_equipment!inner(purchase_cost))
      `)
      .eq('id', fighter_id)
      .single();

    if (error || !fighter) {
      console.error('Error fetching fighter data for credit calculation:', error);
      return 0;
    }

    // Calculate total credits like the database function
    let totalCredits = fighter.credits + (fighter.cost_adjustment || 0);
    
    // Add equipment costs
    if (fighter.fighter_equipment) {
      totalCredits += fighter.fighter_equipment.reduce((sum: number, eq: any) => 
        sum + (eq.purchase_cost || 0), 0
      );
    }
    
    // Add skill costs
    if (fighter.fighter_skills) {
      totalCredits += fighter.fighter_skills.reduce((sum: number, skill: any) => 
        sum + (skill.credits_increase || 0), 0
      );
    }
    
    // Add effect costs
    if (fighter.fighter_effects) {
      totalCredits += fighter.fighter_effects.reduce((sum: number, effect: any) => 
        sum + (effect.type_specific_data?.credits_increase || 0), 0
      );
    }
    
    // Add vehicle costs
    if (fighter.vehicles) {
      totalCredits += fighter.vehicles.reduce((sum: number, vehicle: any) => {
        let vehicleCost = vehicle.cost || 0;
        if (vehicle.fighter_equipment) {
          vehicleCost += vehicle.fighter_equipment.reduce((equipSum: number, eq: any) => 
            equipSum + (eq.purchase_cost || 0), 0
          );
        }
        return sum + vehicleCost;
      }, 0);
    }
    
    return totalCredits;
  } catch (error) {
    console.error('Error calculating fighter credits:', error);
    return 0;
  }
}