'use server'

import {createClient} from "@/utils/supabase/server";
import {checkAdminOptimized, getAuthenticatedUser} from "@/utils/auth";
import {invalidateFighterAddition, CACHE_TAGS} from '@/utils/cache-tags';
import {updateGangFinancials} from '@/utils/gang-rating-and-wealth';
import {logFighterAction} from '@/app/actions/logs/fighter-logs';
import {revalidateTag} from 'next/cache';

interface CopyFighterParams {
  fighter_id: string;
  target_gang_id: string;
  new_name?: string;
  deduct_credits?: boolean;
  add_to_rating?: boolean;
  copy_as_experienced?: boolean;
  calculated_cost?: number;
  copy_vehicles?: boolean;
}

interface CopyFighterResult {
  success: boolean;
  data?: {
    fighter_id: string;
    fighter_name: string;
    copied_vehicles?: number;
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
          fighter_effect_type:fighter_effect_type_id(
            fighter_effect_category:fighter_effect_category_id(
              category_name
            )
          ),
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
        ),
        vehicles(
          id,
          vehicle_name,
          vehicle_type_id,
          vehicle_type,
          movement,
          front,
          side,
          rear,
          hull_points,
          handling,
          save,
          body_slots,
          body_slots_occupied,
          drive_slots,
          drive_slots_occupied,
          engine_slots,
          engine_slots_occupied,
          special_rules,
          cost
        )
      `)
      .eq('id', params.fighter_id)
      .single();

    if (fetchError || !sourceFighter) {
      console.error('Error fetching fighter:', fetchError);
      return { success: false, error: `Fighter not found: ${fetchError?.message || 'Unknown error'}` };
    }

    // Fetch vehicle equipment separately (linked via vehicle_id, not fighter_id)
    let vehicleEquipment: any[] = [];
    if (sourceFighter.vehicles?.length > 0) {
      const vehicleIds = sourceFighter.vehicles.map((v: any) => v.id);

      const { data: vEquip } = await supabase
        .from('fighter_equipment')
        .select('*')
        .in('vehicle_id', vehicleIds);

      vehicleEquipment = vEquip || [];
    }

    // Fetch vehicle effects (lasting damages, upgrades)
    let vehicleEffects: any[] = [];
    if (sourceFighter.vehicles?.length > 0) {
      const vehicleIds = sourceFighter.vehicles.map((v: any) => v.id);

      const { data: vEffects } = await supabase
        .from('fighter_effects')
        .select(`
          *,
          fighter_effect_modifiers(*),
          fighter_effect_type:fighter_effect_type_id(
            fighter_effect_category:fighter_effect_category_id(
              category_name
            )
          )
        `)
        .in('vehicle_id', vehicleIds);

      vehicleEffects = vEffects || [];
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

    // Vehicle ID mapping for equipment remapping
    const vehicleIdMap = new Map<string, string>();
    let copiedVehicleCount = 0;

    // Helper function to rollback (delete the created fighter) on error
    const rollbackFighter = async (errorMessage: string) => {
      console.error('Rolling back fighter creation due to error:', errorMessage);

      // Delete any created vehicles first (due to FK constraint)
      if (vehicleIdMap.size > 0) {
        const newVehicleIds = Array.from(vehicleIdMap.values());
        await supabase.from('vehicles').delete().in('id', newVehicleIds);
      }

      // Delete the fighter
      await supabase.from('fighters').delete().eq('id', newFighterId);

      return { success: false, error: errorMessage };
    };

    // Copy vehicles (if enabled and fighter has vehicles)
    if (params.copy_vehicles !== false && sourceFighter.vehicles?.length > 0) {
      for (const vehicle of sourceFighter.vehicles) {
        const vehicleInsertData: any = {
          vehicle_name: vehicle.vehicle_name,
          vehicle_type_id: vehicle.vehicle_type_id,
          vehicle_type: vehicle.vehicle_type,
          movement: vehicle.movement,
          front: vehicle.front,
          side: vehicle.side,
          rear: vehicle.rear,
          hull_points: vehicle.hull_points,
          handling: vehicle.handling,
          save: vehicle.save,
          body_slots: vehicle.body_slots,
          body_slots_occupied: vehicle.body_slots_occupied,
          drive_slots: vehicle.drive_slots,
          drive_slots_occupied: vehicle.drive_slots_occupied,
          engine_slots: vehicle.engine_slots,
          engine_slots_occupied: vehicle.engine_slots_occupied,
          special_rules: vehicle.special_rules,
          cost: vehicle.cost,
          gang_id: params.target_gang_id,
          fighter_id: newFighterId
        };

        const { data: newVehicle, error: vehicleError } = await supabase
          .from('vehicles')
          .insert(vehicleInsertData)
          .select()
          .single();

        if (vehicleError || !newVehicle) {
          return await rollbackFighter(`Failed to copy vehicle: ${vehicleError?.message}`);
        }

        vehicleIdMap.set(vehicle.id, newVehicle.id);
        copiedVehicleCount++;
      }
    }

    // Copy equipment (fighter equipment only - no vehicle_id)
    if (sourceFighter.fighter_equipment && sourceFighter.fighter_equipment.length > 0) {
      const fighterEquipmentToCopy = sourceFighter.fighter_equipment
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

      if (fighterEquipmentToCopy.length > 0) {
        const { error: equipmentError } = await supabase
          .from('fighter_equipment')
          .insert(fighterEquipmentToCopy);

        if (equipmentError) {
          return await rollbackFighter(`Failed to copy equipment: ${equipmentError.message}`);
        }
      }
    }

    // Copy vehicle equipment (if vehicles were copied)
    if (vehicleIdMap.size > 0 && vehicleEquipment.length > 0) {
      const vehicleEquipmentToCopy = vehicleEquipment
        .filter((eq: any) => vehicleIdMap.has(eq.vehicle_id))
        .map((eq: any) => ({
          vehicle_id: vehicleIdMap.get(eq.vehicle_id),
          equipment_id: eq.equipment_id,
          custom_equipment_id: eq.custom_equipment_id,
          purchase_cost: eq.purchase_cost,
          original_cost: eq.original_cost,
          is_master_crafted: eq.is_master_crafted || false,
          gang_id: params.target_gang_id,
          user_id: gang.user_id
        }));

      if (vehicleEquipmentToCopy.length > 0) {
        const { error: vehicleEquipError } = await supabase
          .from('fighter_equipment')
          .insert(vehicleEquipmentToCopy);

        if (vehicleEquipError) {
          return await rollbackFighter(`Failed to copy vehicle equipment: ${vehicleEquipError.message}`);
        }
      }
    }

    // Copy skills (only when copying as experienced)
    if (params.copy_as_experienced && sourceFighter.fighter_skills && sourceFighter.fighter_skills.length > 0) {
      const skillsToCopy = sourceFighter.fighter_skills.map((skill: any) => ({
        fighter_id: newFighterId,
        skill_id: skill.skill_id,
        user_id: gang.user_id
      }));

      const { error: skillsError } = await supabase
        .from('fighter_skills')
        .insert(skillsToCopy);

      if (skillsError) {
        return await rollbackFighter(`Failed to copy skills: ${skillsError.message}`);
      }
    }

    // Copy effects and modifiers (when experienced: all effects; when not: exclude injuries and advancements)
    if (sourceFighter.fighter_effects && sourceFighter.fighter_effects.length > 0) {
      const effectsToCopyList = params.copy_as_experienced
        ? sourceFighter.fighter_effects
        : sourceFighter.fighter_effects.filter((effect: any) => {
            const categoryName = effect.fighter_effect_type?.fighter_effect_category?.category_name;
            return categoryName !== 'injuries' && categoryName !== 'advancements';
          });

      if (effectsToCopyList.length > 0) {
        const effectsToCopy = effectsToCopyList.map((effect: any) => ({
          fighter_id: newFighterId,
          effect_name: effect.effect_name,
          fighter_effect_type_id: effect.fighter_effect_type_id,
          type_specific_data: effect.type_specific_data,
          fighter_equipment_id: null,
          user_id: gang.user_id
        }));

        const { data: insertedEffects, error: effectsError } = await supabase
          .from('fighter_effects')
          .insert(effectsToCopy)
          .select('id');

        if (effectsError) {
          return await rollbackFighter(`Failed to copy effects: ${effectsError.message}`);
        }

        if (insertedEffects) {
          const allModifiers: any[] = [];
          effectsToCopyList.forEach((sourceEffect: any, index: number) => {
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
              return await rollbackFighter(`Failed to copy effect modifiers: ${modifiersError.message}`);
            }
          }
        }
      }
    }

    // Copy injuries (only if copying as experienced)
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
        return await rollbackFighter(`Failed to copy injuries: ${injuriesError.message}`);
      }
    }

    // Copy vehicle effects (lasting damages, upgrades) if vehicles were copied. When not copy_as_experienced, exclude lasting damages.
    if (vehicleIdMap.size > 0 && vehicleEffects.length > 0) {
      for (const effect of vehicleEffects) {
        if (!vehicleIdMap.has(effect.vehicle_id)) continue;

        if (!params.copy_as_experienced) {
          const categoryName = effect.fighter_effect_type?.fighter_effect_category?.category_name;
          if (categoryName === 'lasting damages') continue;
        }

        const effectInsertData = {
          vehicle_id: vehicleIdMap.get(effect.vehicle_id),
          effect_name: effect.effect_name,
          fighter_effect_type_id: effect.fighter_effect_type_id,
          type_specific_data: effect.type_specific_data,
          user_id: gang.user_id
        };

        const { data: newEffect, error: effectError } = await supabase
          .from('fighter_effects')
          .insert(effectInsertData)
          .select('id')
          .single();

        if (effectError) {
          return await rollbackFighter(`Failed to copy vehicle effect: ${effectError.message}`);
        }

        // Copy effect modifiers
        if (newEffect && effect.fighter_effect_modifiers?.length > 0) {
          const modifiersToCopy = effect.fighter_effect_modifiers.map((m: any) => ({
            fighter_effect_id: newEffect.id,
            stat_name: m.stat_name,
            numeric_value: m.numeric_value
          }));

          const { error: modifiersError } = await supabase
            .from('fighter_effect_modifiers')
            .insert(modifiersToCopy);

          if (modifiersError) {
            return await rollbackFighter(`Failed to copy vehicle effect modifiers: ${modifiersError.message}`);
          }
        }
      }
    }

    // Update gang credits, rating and wealth using helper
    const cost = params.calculated_cost ?? sourceFighter.credits ?? 0;

    // Update rating/wealth using helper (handles cache invalidation)
    const financialResult = await updateGangFinancials(supabase, {
      gangId: params.target_gang_id,
      ratingDelta: cost,
      creditsDelta: params.deduct_credits ? -cost : 0,
      applyToRating: params.add_to_rating !== false
    });

    if (!financialResult.success) {
      return await rollbackFighter(financialResult.error || 'Failed to update gang financials');
    }

    // Update last_updated separately (not part of financials)
    if (params.deduct_credits) {
      await supabase
        .from('gangs')
        .update({ last_updated: new Date().toISOString() })
        .eq('id', params.target_gang_id);
    }

    invalidateFighterAddition({
      fighterId: newFighterId,
      gangId: params.target_gang_id,
      userId: gang.user_id
    });

    // Invalidate vehicle-related caches if vehicles were copied
    if (copiedVehicleCount > 0) {
      revalidateTag(CACHE_TAGS.BASE_GANG_VEHICLES(params.target_gang_id));
    }

    await logFighterAction({
      gang_id: params.target_gang_id,
      fighter_id: newFighterId,
      fighter_name: newFighterName,
      action_type: 'fighter_copied',
      fighter_credits: params.calculated_cost || sourceFighter.credits || 0,
      source_fighter_name: sourceFighter.fighter_name,
      copy_type: params.copy_as_experienced ? 'experienced' : 'base',
      user_id: user.id,
      oldCredits: financialResult.oldValues?.credits,
      oldRating: financialResult.oldValues?.rating,
      oldWealth: financialResult.oldValues?.wealth,
      newCredits: financialResult.newValues?.credits,
      newRating: financialResult.newValues?.rating,
      newWealth: financialResult.newValues?.wealth
    });

    return {
      success: true,
      data: {
        fighter_id: newFighterId,
        fighter_name: newFighterName,
        copied_vehicles: copiedVehicleCount > 0 ? copiedVehicleCount : undefined
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
