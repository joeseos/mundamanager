'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";
import { getGangRating } from "@/app/lib/shared/gang-data";

// Advancement Logging Functions

interface CharacteristicAdvancementLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  characteristic_name: string;
  xp_cost: number;
  credits_increase: number;
  remaining_xp: number;
  include_gang_rating?: boolean;
}

interface SkillAdvancementLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  skill_name: string;
  xp_cost: number;
  credits_increase: number;
  remaining_xp: number;
  is_advance?: boolean;
  include_gang_rating?: boolean;
}

interface AdvancementDeletionLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  advancement_name: string;
  advancement_type: 'skill' | 'characteristic';
  xp_refunded: number;
  new_xp_total: number;
  include_gang_rating?: boolean;
}

interface FighterInjuryLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  injury_name: string;
}

interface FighterRecoveryLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  recovery_type: 'recovered' | 'sent_to_recovery' | 'injury_removed';
  recovered_from?: string;
}

// Gang rating calculation now uses cached getGangRating function

async function calculateGangRating(supabase: any, gangId: string): Promise<number> {
  try {
    return await getGangRating(gangId, supabase);
  } catch (error) {
    console.error('Failed to get cached gang rating:', error);
    return 0;
  }
}

export async function logCharacteristicAdvancement(params: CharacteristicAdvancementLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    let description = `Fighter "${params.fighter_name}" advanced ${params.characteristic_name} for ${params.xp_cost} XP (+${params.credits_increase} credits). Remaining XP: ${params.remaining_xp}`;
    
    if (params.include_gang_rating) {
      const gangRating = await calculateGangRating(supabase, params.gang_id);
      description += `. New gang rating: ${gangRating}`;
    }

    return await createGangLog({
      gang_id: params.gang_id,
      fighter_id: params.fighter_id,
      action_type: 'fighter_characteristic_advancement',
      description
    });
  } catch (error) {
    console.error('Error logging characteristic advancement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log characteristic advancement'
    };
  }
}

export async function logSkillAdvancement(params: SkillAdvancementLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    const advancementType = params.is_advance ? 'gained' : 'learned';
    let description = `Fighter "${params.fighter_name}" ${advancementType} skill "${params.skill_name}" for ${params.xp_cost} XP (+${params.credits_increase} credits). Remaining XP: ${params.remaining_xp}`;
    
    if (params.include_gang_rating) {
      const gangRating = await calculateGangRating(supabase, params.gang_id);
      description += `. New gang rating: ${gangRating}`;
    }

    return createGangLog({
      gang_id: params.gang_id,
      fighter_id: params.fighter_id,
      action_type: params.is_advance ? 'fighter_skill_advancement' : 'fighter_skill_learned',
      description
    });
  } catch (error) {
    console.error('Error logging skill advancement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log skill advancement'
    };
  }
}

export async function logAdvancementDeletion(params: AdvancementDeletionLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    let description = `Fighter "${params.fighter_name}" removed ${params.advancement_type} "${params.advancement_name}" (refunded ${params.xp_refunded} XP). New XP total: ${params.new_xp_total}`;
    
    if (params.include_gang_rating) {
      const gangRating = await calculateGangRating(supabase, params.gang_id);
      description += `. New gang rating: ${gangRating}`;
    }

    return createGangLog({
      gang_id: params.gang_id,
      fighter_id: params.fighter_id,
      action_type: `fighter_${params.advancement_type}_removed`,
      description
    });
  } catch (error) {
    console.error('Error logging advancement deletion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log advancement deletion'
    };
  }
}

export async function logFighterInjury(params: FighterInjuryLogParams): Promise<GangLogActionResult> {
  try {
    let description = `Fighter "${params.fighter_name}" sustained serious injury: "${params.injury_name}"`;

    return await createGangLog({
      gang_id: params.gang_id,
      fighter_id: params.fighter_id,
      action_type: 'fighter_injured',
      description
    });
  } catch (error) {
    console.error('Error logging fighter injury:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log fighter injury'
    };
  }
}

export async function logFighterRecovery(params: FighterRecoveryLogParams): Promise<GangLogActionResult> {
  try {
    let description;
    
    switch (params.recovery_type) {
      case 'injury_removed':
        description = `Fighter "${params.fighter_name}" recovered from injury: "${params.recovered_from}"`;
        break;
      case 'recovered':
        description = `Fighter "${params.fighter_name}" recovered and is ready for battle`;
        break;  
      case 'sent_to_recovery':
        description = `Fighter "${params.fighter_name}" sent to recovery`;
        break;
      default:
        description = `Fighter "${params.fighter_name}" recovery status changed`;
    }

    return await createGangLog({
      gang_id: params.gang_id,
      fighter_id: params.fighter_id,
      action_type: 'fighter_recovered',
      description
    });
  } catch (error) {
    console.error('Error logging fighter recovery:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log fighter recovery'
    };
  }
}