'use server'

import { createClient } from "@/utils/supabase/server";

interface CreateGangLogParams {
  gang_id: string;
  action_type: string;
  description: string;
  fighter_id?: string;
  vehicle_id?: string;
  user_id?: string;
}

interface GangLogActionResult {
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

    // Insert gang log
    const { data, error } = await supabase
      .from('gang_logs')
      .insert({
        gang_id: params.gang_id,
        user_id: userId,
        action_type: params.action_type,
        description: params.description,
        fighter_id: params.fighter_id || null,
        vehicle_id: params.vehicle_id || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating gang log:', error);
      throw new Error(error.message || 'Failed to create gang log');
    }

    return { 
      success: true, 
      data
    };
  } catch (error) {
    console.error('Error in createGangLog server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create gang log'
    };
  }
}

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

// Type for fighter data needed for gang rating calculation
interface FighterForRating {
  id: string;
  credits: number;
  cost_adjustment: number | null;
  killed: boolean;
  retired: boolean;
  enslaved: boolean;
  fighter_class: string | null;
}

interface FighterEquipment {
  purchase_cost: number;
}

interface FighterSkill {
  credits_increase: number;
}

interface FighterEffect {
  type_specific_data: {
    credits_increase?: number;
  } | null;
}

interface Vehicle {
  cost: number;
}

async function calculateGangRating(supabase: any, gangId: string): Promise<number> { // abomination needs changing before merge
  try {
    // Get all active fighters with their related data
    const { data: fighters, error } = await supabase
      .from('fighters')
      .select(`
        id,
        credits,
        cost_adjustment,
        killed,
        retired,
        enslaved,
        fighter_class,
        fighter_equipment(purchase_cost),
        fighter_skills(credits_increase),
        fighter_effects(type_specific_data),
        vehicles(cost)
      `)
      .eq('gang_id', gangId);
    
    if (error) {
      console.error('Error fetching fighters for gang rating:', error);
      return 0;
    }

    const typedFighters: (FighterForRating & {
      fighter_equipment: FighterEquipment[];
      fighter_skills: FighterSkill[];
      fighter_effects: FighterEffect[];
      vehicles: Vehicle[];
    })[] = fighters || [];

    const gangRating: number = typedFighters
      .filter((f) => !f.killed && !f.retired && !f.enslaved)
      .reduce((total: number, fighter) => {
        // Exclude exotic beasts from direct rating calculation
        if (fighter.fighter_class === 'exotic beast') {
          return total;
        }

        const baseCredits = fighter.credits || 0;
        const costAdjustment = fighter.cost_adjustment || 0;
        const equipmentCosts = fighter.fighter_equipment?.reduce((sum, eq) => sum + (eq.purchase_cost || 0), 0) || 0;
        const skillCredits = fighter.fighter_skills?.reduce((sum, skill) => sum + (skill.credits_increase || 0), 0) || 0;
        const effectCredits = fighter.fighter_effects?.reduce((sum, effect) => {
          const creditsIncrease = effect.type_specific_data?.credits_increase || 0;
          return sum + creditsIncrease;
        }, 0) || 0;
        const vehicleCosts = fighter.vehicles?.reduce((sum, vehicle) => sum + (vehicle.cost || 0), 0) || 0;

        const fighterTotalValue = baseCredits + costAdjustment + equipmentCosts + skillCredits + effectCredits + vehicleCosts;
        
        return total + fighterTotalValue;
      }, 0);

    return gangRating;
  } catch (error) {
    console.error('Failed to calculate gang rating:', error);
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

// Convenience function for batch advancement logging
export async function logMultipleAdvancements(advancements: (CharacteristicAdvancementLogParams | SkillAdvancementLogParams)[]): Promise<GangLogActionResult[]> {
  const results = await Promise.allSettled(
    advancements.map(advancement => {
      if ('characteristic_name' in advancement) {
        return logCharacteristicAdvancement(advancement);
      } else {
        return logSkillAdvancement(advancement);
      }
    })
  );

  return results.map(result => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        success: false,
        error: result.reason?.message || 'Failed to log advancement'
      };
    }
  });
}