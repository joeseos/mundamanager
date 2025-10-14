'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { invalidateFighterAddition, invalidateGangRating } from '@/utils/cache-tags';
import { logFighterAction } from '@/app/actions/logs/fighter-logs';

interface CopyFighterParams {
  fighter_id: string;
  target_gang_id: string;
  new_name?: string;
  deduct_credits?: boolean;
  add_to_rating?: boolean;
  copy_as_experienced?: boolean;
  calculated_cost?: number;
}

interface CopyFighterResult {
  success: boolean;
  data?: {
    fighter_id: string;
    fighter_name: string;
  };
  error?: string;
}

export async function copyFighter(params: CopyFighterParams): Promise<CopyFighterResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const isAdmin = await checkAdminOptimized(supabase);

    const { data: sourceFighter, error: fetchError } = await supabase
      .from('fighters')
      .select(`
        *,
        fighter_equipment(
          equipment_id,
          custom_equipment_id,
          purchase_cost,
          original_cost,
          is_master_crafted,
          vehicle_id
        ),
        fighter_skills(
          skill_id
        ),
        fighter_effects(
          id,
          effect_name,
          fighter_effect_type_id,
          type_specific_data,
          fighter_effect_modifiers(
            stat_name,
            numeric_value
          )
        ),
        fighter_injuries(
          injury_id,
          injury_name,
          code_1,
          code_2,
          characteristic_1,
          characteristic_2
        )
      `)
      .eq('id', params.fighter_id)
      .single();

    if (fetchError || !sourceFighter) {
      console.error('Error fetching fighter:', fetchError);
      return { success: false, error: `Fighter not found: ${fetchError?.message || 'Unknown error'}` };
    }

    if (sourceFighter.gang_id !== params.target_gang_id) {
      return { success: false, error: 'Can only copy fighters within the same gang' };
    }

    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, user_id, rating, credits')
      .eq('id', sourceFighter.gang_id)
      .single();

    if (gangError || !gang) {
      return { success: false, error: 'Gang not found' };
    }

    const ownsGang = gang.user_id === user.id;

    if (!ownsGang && !isAdmin) {
      return { success: false, error: 'Unauthorized: You do not own this fighter' };
    }

    if (params.deduct_credits) {
      const cost = params.calculated_cost ?? sourceFighter.credits ?? 0;
      const currentCredits = gang.credits || 0;
      if (currentCredits < cost) {
        return {
          success: false,
          error: `Not enough credits. Gang has ${currentCredits} credits but fighter costs ${cost}`
        };
      }
    }

    const { data: maxPositionData } = await supabase
      .from('fighters')
      .select('position')
      .eq('gang_id', params.target_gang_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const nextPosition = (maxPositionData?.position ?? -1) + 1;
    const newFighterName = params.new_name || sourceFighter.fighter_name;

    const fighterData: any = {
      gang_id: params.target_gang_id,
      fighter_name: newFighterName,
      fighter_type: sourceFighter.fighter_type,
      fighter_type_id: sourceFighter.fighter_type_id,
      fighter_class: sourceFighter.fighter_class,
      fighter_class_id: sourceFighter.fighter_class_id,
      fighter_sub_type: sourceFighter.fighter_sub_type,
      fighter_sub_type_id: sourceFighter.fighter_sub_type_id,
      custom_fighter_type_id: sourceFighter.custom_fighter_type_id,
      fighter_gang_legacy_id: sourceFighter.fighter_gang_legacy_id,
      user_id: gang.user_id,

      movement: sourceFighter.movement,
      weapon_skill: sourceFighter.weapon_skill,
      ballistic_skill: sourceFighter.ballistic_skill,
      strength: sourceFighter.strength,
      toughness: sourceFighter.toughness,
      wounds: sourceFighter.wounds,
      initiative: sourceFighter.initiative,
      attacks: sourceFighter.attacks,
      leadership: sourceFighter.leadership,
      cool: sourceFighter.cool,
      willpower: sourceFighter.willpower,
      intelligence: sourceFighter.intelligence,

      xp: params.copy_as_experienced ? sourceFighter.xp : 0,
      total_xp: params.copy_as_experienced ? sourceFighter.total_xp : 0,
      kills: params.copy_as_experienced ? sourceFighter.kills : 0,

      credits: sourceFighter.credits,
      cost_adjustment: sourceFighter.cost_adjustment,

      special_rules: sourceFighter.special_rules,
      free_skill: sourceFighter.free_skill,
      label: sourceFighter.label,
      image_url: sourceFighter.image_url,
      note: sourceFighter.note,
      note_backstory: sourceFighter.note_backstory,

      killed: false,
      retired: false,
      enslaved: false,
      captured: false,
      recovery: false,
      starved: false,

      position: nextPosition
    };

    const { data: newFighter, error: insertError } = await supabase
      .from('fighters')
      .insert(fighterData)
      .select('id, fighter_name')
      .single();

    if (insertError || !newFighter) {
      return { success: false, error: `Failed to copy fighter: ${insertError?.message}` };
    }

    const newFighterId = newFighter.id;

    if (sourceFighter.fighter_equipment && sourceFighter.fighter_equipment.length > 0) {
      const equipmentToCopy = sourceFighter.fighter_equipment
        .filter((eq: any) => !eq.vehicle_id)
        .map((eq: any) => ({
          fighter_id: newFighterId,
          equipment_id: eq.equipment_id,
          custom_equipment_id: eq.custom_equipment_id,
          purchase_cost: eq.purchase_cost,
          original_cost: eq.original_cost,
          is_master_crafted: eq.is_master_crafted || false,
          gang_id: params.target_gang_id,
          user_id: gang.user_id
        }));

      if (equipmentToCopy.length > 0) {
        const { error: equipmentError } = await supabase
          .from('fighter_equipment')
          .insert(equipmentToCopy);

        if (equipmentError) {
          console.error('Error copying equipment:', equipmentError);
        }
      }
    }

    if (sourceFighter.fighter_skills && sourceFighter.fighter_skills.length > 0) {
      const skillsToCopy = sourceFighter.fighter_skills.map((skill: any) => ({
        fighter_id: newFighterId,
        skill_id: skill.skill_id,
        user_id: gang.user_id
      }));

      const { error: skillsError } = await supabase
        .from('fighter_skills')
        .insert(skillsToCopy);

      if (skillsError) {
        console.error('Error copying skills:', skillsError);
      }
    }

    if (params.copy_as_experienced && sourceFighter.fighter_effects && sourceFighter.fighter_effects.length > 0) {
      const effectsToCopy = sourceFighter.fighter_effects.map((effect: any) => ({
        fighter_id: newFighterId,
        effect_name: effect.effect_name,
        fighter_effect_type_id: effect.fighter_effect_type_id,
        type_specific_data: effect.type_specific_data,
        user_id: gang.user_id
      }));

      const { data: insertedEffects, error: effectsError } = await supabase
        .from('fighter_effects')
        .insert(effectsToCopy)
        .select('id');

      if (effectsError) {
        console.error('Error copying effects:', effectsError);
      } else if (insertedEffects) {
        const allModifiers: any[] = [];
        sourceFighter.fighter_effects.forEach((sourceEffect: any, index: number) => {
          const newEffectId = insertedEffects[index]?.id;
          if (newEffectId && sourceEffect.fighter_effect_modifiers) {
            sourceEffect.fighter_effect_modifiers.forEach((modifier: any) => {
              allModifiers.push({
                fighter_effect_id: newEffectId,
                stat_name: modifier.stat_name,
                numeric_value: modifier.numeric_value
              });
            });
          }
        });

        if (allModifiers.length > 0) {
          const { error: modifiersError } = await supabase
            .from('fighter_effect_modifiers')
            .insert(allModifiers);

          if (modifiersError) {
            console.error('Error copying effect modifiers:', modifiersError);
          }
        }
      }
    }

    if (params.copy_as_experienced && sourceFighter.fighter_injuries && sourceFighter.fighter_injuries.length > 0) {
      const injuriesToCopy = sourceFighter.fighter_injuries.map((injury: any) => ({
        fighter_id: newFighterId,
        injury_id: injury.injury_id,
        injury_name: injury.injury_name,
        code_1: injury.code_1,
        code_2: injury.code_2,
        characteristic_1: injury.characteristic_1,
        characteristic_2: injury.characteristic_2
      }));

      const { error: injuriesError } = await supabase
        .from('fighter_injuries')
        .insert(injuriesToCopy);

      if (injuriesError) {
        console.error('Error copying injuries:', injuriesError);
      }
    }

    // Update gang credits and rating
    const cost = params.calculated_cost ?? sourceFighter.credits ?? 0;
    const updateData: any = {};

    if (params.add_to_rating !== false) {
      const newRating = (gang.rating || 0) + cost;
      updateData.rating = newRating;
    }

    if (params.deduct_credits) {
      const currentCredits = gang.credits || 0;
      updateData.credits = currentCredits - cost;
    }

    if (Object.keys(updateData).length > 0) {
      updateData.last_updated = new Date().toISOString();
      await supabase
        .from('gangs')
        .update(updateData)
        .eq('id', params.target_gang_id);
    }

    invalidateFighterAddition({
      fighterId: newFighterId,
      gangId: params.target_gang_id,
      userId: gang.user_id
    });

    if (params.add_to_rating !== false) {
      invalidateGangRating(params.target_gang_id);
    }

    await logFighterAction({
      gang_id: params.target_gang_id,
      fighter_id: newFighterId,
      fighter_name: newFighterName,
      action_type: 'fighter_copied',
      fighter_credits: params.calculated_cost || sourceFighter.credits || 0,
      source_fighter_name: sourceFighter.fighter_name,
      copy_type: params.copy_as_experienced ? 'experienced' : 'base',
      user_id: user.id
    });

    return {
      success: true,
      data: {
        fighter_id: newFighterId,
        fighter_name: newFighterName
      }
    };

  } catch (error) {
    console.error('Error copying fighter:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
