'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { invalidateFighterAddition, invalidateGangRating } from '@/utils/cache-tags';

interface CopyFighterParams {
  fighter_id: string;
  target_gang_id: string;
  new_name?: string;
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

    // Get the source fighter with all related data
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

    // Get source gang to check permissions
    const { data: sourceGang, error: sourceGangError } = await supabase
      .from('gangs')
      .select('id, user_id')
      .eq('id', sourceFighter.gang_id)
      .single();

    if (sourceGangError || !sourceGang) {
      return { success: false, error: 'Source gang not found' };
    }

    // Get target gang
    const { data: targetGang, error: targetGangError } = await supabase
      .from('gangs')
      .select('id, user_id')
      .eq('id', params.target_gang_id)
      .single();

    if (targetGangError || !targetGang) {
      return { success: false, error: 'Target gang not found' };
    }

    // Get campaign info for both gangs if copying to different gang
    let sourceCampaignId = null;
    let targetCampaignId = null;

    if (sourceFighter.gang_id !== params.target_gang_id) {
      // Get source gang's campaign
      const { data: sourceCampaignGang } = await supabase
        .from('campaign_gangs')
        .select('campaign_id')
        .eq('gang_id', sourceFighter.gang_id)
        .single();

      sourceCampaignId = sourceCampaignGang?.campaign_id || null;

      // Get target gang's campaign
      const { data: targetCampaignGang } = await supabase
        .from('campaign_gangs')
        .select('campaign_id')
        .eq('gang_id', params.target_gang_id)
        .single();

      targetCampaignId = targetCampaignGang?.campaign_id || null;
    }

    // Permission checks:
    // 1. User must own the source gang OR be admin
    // 2. If copying to a different gang:
    //    - Must be admin
    //    - Gangs must be in the same campaign (if source gang has a campaign)
    const ownsSourceGang = sourceGang.user_id === user.id;
    const ownsTargetGang = targetGang.user_id === user.id;
    const isSameGang = sourceFighter.gang_id === params.target_gang_id;

    if (!ownsSourceGang && !isAdmin) {
      return { success: false, error: 'Unauthorized: You do not own this fighter' };
    }

    if (!isSameGang) {
      if (!isAdmin) {
        return { success: false, error: 'Unauthorized: Only admins can copy fighters to other gangs' };
      }

      // Check if gangs are in the same campaign (if applicable)
      if (sourceCampaignId && targetCampaignId && sourceCampaignId !== targetCampaignId) {
        return { success: false, error: 'Gangs must be in the same campaign' };
      }
    }

    // Get the max position in the target gang to add fighter at the end
    const { data: maxPositionData } = await supabase
      .from('fighters')
      .select('position')
      .eq('gang_id', params.target_gang_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const nextPosition = (maxPositionData?.position ?? -1) + 1;

    // Prepare fighter data for insertion
    const newFighterName = params.new_name || `${sourceFighter.fighter_name} (Copy)`;

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
      user_id: targetGang.user_id, // Set to target gang owner

      // Stats
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

      // Progress/XP
      xp: sourceFighter.xp,
      total_xp: sourceFighter.total_xp,
      kills: sourceFighter.kills,

      // Costs and credits
      credits: sourceFighter.credits,
      cost_adjustment: sourceFighter.cost_adjustment,

      // Other attributes
      special_rules: sourceFighter.special_rules,
      free_skill: sourceFighter.free_skill,
      label: sourceFighter.label,
      image_url: sourceFighter.image_url,
      note: sourceFighter.note,
      note_backstory: sourceFighter.note_backstory,

      // Status flags - reset these for the copy
      killed: false,
      retired: false,
      enslaved: false,
      captured: false,
      recovery: false,
      starved: false,

      // Positioning - add to the end of the gang
      position: nextPosition
    };

    // Insert the new fighter
    const { data: newFighter, error: insertError } = await supabase
      .from('fighters')
      .insert(fighterData)
      .select('id, fighter_name')
      .single();

    if (insertError || !newFighter) {
      return { success: false, error: `Failed to copy fighter: ${insertError?.message}` };
    }

    const newFighterId = newFighter.id;

    // Copy equipment (excluding vehicle-mounted equipment)
    if (sourceFighter.fighter_equipment && sourceFighter.fighter_equipment.length > 0) {
      const equipmentToCopy = sourceFighter.fighter_equipment
        .filter((eq: any) => !eq.vehicle_id) // Exclude vehicle-mounted equipment
        .map((eq: any) => ({
          fighter_id: newFighterId,
          equipment_id: eq.equipment_id,
          custom_equipment_id: eq.custom_equipment_id,
          purchase_cost: eq.purchase_cost,
          original_cost: eq.original_cost,
          is_master_crafted: eq.is_master_crafted || false,
          gang_id: params.target_gang_id,
          user_id: targetGang.user_id
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

    // Copy skills
    if (sourceFighter.fighter_skills && sourceFighter.fighter_skills.length > 0) {
      const skillsToCopy = sourceFighter.fighter_skills.map((skill: any) => ({
        fighter_id: newFighterId,
        skill_id: skill.skill_id,
        user_id: targetGang.user_id
      }));

      const { error: skillsError } = await supabase
        .from('fighter_skills')
        .insert(skillsToCopy);

      if (skillsError) {
        console.error('Error copying skills:', skillsError);
      }
    }

    // Copy effects and their modifiers
    if (sourceFighter.fighter_effects && sourceFighter.fighter_effects.length > 0) {
      const effectsToCopy = sourceFighter.fighter_effects.map((effect: any) => ({
        fighter_id: newFighterId,
        effect_name: effect.effect_name,
        fighter_effect_type_id: effect.fighter_effect_type_id,
        type_specific_data: effect.type_specific_data,
        user_id: targetGang.user_id
      }));

      const { data: insertedEffects, error: effectsError } = await supabase
        .from('fighter_effects')
        .insert(effectsToCopy)
        .select('id');

      if (effectsError) {
        console.error('Error copying effects:', effectsError);
      } else if (insertedEffects) {
        // Copy effect modifiers
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

    // Copy injuries
    if (sourceFighter.fighter_injuries && sourceFighter.fighter_injuries.length > 0) {
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

    // Note: Stat advancements are stored as fighter_effects with modifiers,
    // so they are already copied through the fighter_effects section above

    // Update gang rating for target gang
    const { data: gangData } = await supabase
      .from('gangs')
      .select('rating')
      .eq('id', params.target_gang_id)
      .single();

    if (gangData) {
      const fighterCost = sourceFighter.credits || 0;
      const newRating = (gangData.rating || 0) + fighterCost;

      await supabase
        .from('gangs')
        .update({ rating: newRating })
        .eq('id', params.target_gang_id);
    }

    // Invalidate caches
    invalidateFighterAddition({
      fighterId: newFighterId,
      gangId: params.target_gang_id,
      userId: targetGang.user_id
    });
    invalidateGangRating(params.target_gang_id);

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
