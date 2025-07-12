'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { checkAdmin } from '@/utils/auth';

interface SelectedEquipment {
  equipment_id: string;
  cost: number;
  quantity?: number;
}

interface AddFighterParams {
  fighter_name: string;
  fighter_type_id: string;
  gang_id: string;
  cost?: number;
  selected_equipment?: SelectedEquipment[];
  default_equipment?: SelectedEquipment[];
  user_id?: string;
  use_base_cost_for_rating?: boolean;
}

interface FighterStats {
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  attacks: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  xp: number;
  kills: number;
}

interface AddFighterResult {
  success: boolean;
  data?: {
    fighter_id: string;
    fighter_name: string;
    fighter_type: string;
    fighter_class: string;
    fighter_class_id: string;
    fighter_sub_type_id?: string;
    free_skill: boolean;
    cost: number;
    rating_cost: number;
    total_cost: number;
    stats: FighterStats;
    equipment: Array<{
      fighter_equipment_id: string;
      equipment_id: string;
      equipment_name: string;
      equipment_type: string;
      cost: number;
      weapon_profiles?: any[];
    }>;
    skills: Array<{
      skill_id: string;
      skill_name: string;
    }>;
    special_rules?: string[];
  };
  error?: string;
}

export async function addFighterToGang(
  params: AddFighterParams
): Promise<AddFighterResult> {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    // Use provided user_id or current user's id
    const effectiveUserId = params.user_id || user.id;

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase);

    // Get fighter type data and gang data in parallel
    const [fighterTypeResult, gangResult] = await Promise.all([
      supabase
        .from('fighter_types')
        .select('*')
        .eq('id', params.fighter_type_id)
        .single(),
      supabase
        .from('gangs')
        .select('id, credits, user_id, gang_type_id')
        .eq('id', params.gang_id)
        .single(),
    ]);

    const { data: fighterTypeData, error: fighterTypeError } =
      fighterTypeResult;
    const { data: gangData, error: gangError } = gangResult;

    if (fighterTypeError || !fighterTypeData) {
      throw new Error(
        `Fighter type not found: ${fighterTypeError?.message || 'No data returned'}`
      );
    }

    if (gangError || !gangData) {
      throw new Error('Gang not found');
    }

    // Check permissions - if not admin, must be gang owner
    if (!isAdmin && gangData.user_id !== effectiveUserId) {
      throw new Error(
        'User does not have permission to add fighters to this gang'
      );
    }

    // Check for adjusted cost based on gang type
    const { data: adjustedCostData } = await supabase
      .from('fighter_type_gang_cost')
      .select('adjusted_cost')
      .eq('fighter_type_id', params.fighter_type_id)
      .eq('gang_type_id', gangData.gang_type_id)
      .single();

    // Use adjusted cost if available, otherwise use the original cost
    const adjustedBaseCost =
      adjustedCostData?.adjusted_cost ?? fighterTypeData.cost;

    // Calculate costs
    const fighterCost = params.cost ?? adjustedBaseCost;
    const baseCost = adjustedBaseCost;

    // Calculate equipment cost from selected equipment
    const totalEquipmentCost =
      params.selected_equipment?.reduce(
        (sum, item) => sum + item.cost * (item.quantity || 1),
        0
      ) || 0;

    // Calculate rating cost based on use_base_cost_for_rating setting
    const ratingCost = params.use_base_cost_for_rating
      ? baseCost + totalEquipmentCost
      : fighterCost;

    // Check if gang has enough credits
    if (gangData.credits < fighterCost) {
      throw new Error('Not enough credits to add this fighter with equipment');
    }

    // Insert fighter
    const { data: insertedFighter, error: insertError } = await supabase
      .from('fighters')
      .insert({
        fighter_name: params.fighter_name,
        gang_id: params.gang_id,
        fighter_type_id: params.fighter_type_id,
        fighter_class_id: fighterTypeData.fighter_class_id,
        fighter_sub_type_id: fighterTypeData.fighter_sub_type_id,
        fighter_type: fighterTypeData.fighter_type,
        fighter_class: fighterTypeData.fighter_class,
        free_skill: fighterTypeData.free_skill,
        credits: ratingCost,
        movement: fighterTypeData.movement,
        weapon_skill: fighterTypeData.weapon_skill,
        ballistic_skill: fighterTypeData.ballistic_skill,
        strength: fighterTypeData.strength,
        toughness: fighterTypeData.toughness,
        wounds: fighterTypeData.wounds,
        initiative: fighterTypeData.initiative,
        attacks: fighterTypeData.attacks,
        leadership: fighterTypeData.leadership,
        cool: fighterTypeData.cool,
        willpower: fighterTypeData.willpower,
        intelligence: fighterTypeData.intelligence,
        xp: 0,
        kills: 0,
        special_rules: fighterTypeData.special_rules,
        user_id: gangData.user_id,
      })
      .select()
      .single();

    if (insertError || !insertedFighter) {
      throw new Error(`Failed to insert fighter: ${insertError?.message}`);
    }

    const fighterId = insertedFighter.id;

    // Prepare equipment insertions
    const equipmentInserts: Array<{
      fighter_id: string;
      equipment_id: string;
      original_cost: number;
      purchase_cost: number;
    }> = [];

    // Add default equipment (from params.default_equipment)
    if (params.default_equipment && params.default_equipment.length > 0) {
      params.default_equipment.forEach((defaultItem) => {
        for (let i = 0; i < (defaultItem.quantity || 1); i++) {
          equipmentInserts.push({
            fighter_id: fighterId,
            equipment_id: defaultItem.equipment_id,
            original_cost: defaultItem.cost || 0,
            purchase_cost: 0, // Default equipment is free
          });
        }
      });
    }

    // Add selected equipment (from equipment selections)
    if (params.selected_equipment && params.selected_equipment.length > 0) {
      params.selected_equipment.forEach((selectedItem) => {
        for (let i = 0; i < (selectedItem.quantity || 1); i++) {
          equipmentInserts.push({
            fighter_id: fighterId,
            equipment_id: selectedItem.equipment_id,
            original_cost: selectedItem.cost,
            purchase_cost: 0, // Equipment selections are already paid for in the fighter cost
          });
        }
      });
    }

    // Get default skills from fighter_defaults table
    const { data: fighterDefaultsData } = await supabase
      .from('fighter_defaults')
      .select(
        `
        skill_id,
        skills!skill_id(
          id,
          name
        )
      `
      )
      .eq('fighter_type_id', params.fighter_type_id)
      .not('skill_id', 'is', null);

    // Execute equipment and skills insertion in parallel
    const insertPromises: Promise<any>[] = [];

    // Add equipment insertion promise
    if (equipmentInserts.length > 0) {
      insertPromises.push(
        Promise.resolve(
          supabase.from('fighter_equipment').insert(equipmentInserts).select(`
              id,
              equipment_id,
              original_cost,
              purchase_cost,
              equipment!equipment_id(
                id,
                equipment_name,
                equipment_type,
                cost
              )
            `)
        ).then((result) => ({ type: 'equipment' as const, result }))
      );
    }

    // Add skills insertion promise
    if (fighterDefaultsData && fighterDefaultsData.length > 0) {
      const skillInserts = fighterDefaultsData.map((skill) => ({
        fighter_id: fighterId,
        skill_id: skill.skill_id,
        user_id: gangData.user_id,
      }));

      insertPromises.push(
        Promise.resolve(
          supabase.from('fighter_skills').insert(skillInserts).select(`
              skill_id,
              skills!skill_id(
                id,
                name
              )
            `)
        ).then((result) => ({ type: 'skills' as const, result }))
      );
    }

    // Update gang credits
    insertPromises.push(
      Promise.resolve(
        supabase
          .from('gangs')
          .update({
            credits: gangData.credits - fighterCost,
            last_updated: new Date().toISOString(),
          })
          .eq('id', params.gang_id)
      ).then((result) => ({ type: 'gang_update' as const, result }))
    );

    // Execute all inserts
    const insertResults = await Promise.allSettled(insertPromises);

    // Process results with type information
    let equipmentWithProfiles: any[] = [];
    let insertedSkills: any[] = [];
    let gangUpdateError: any = null;

    for (const result of insertResults) {
      if (result.status === 'fulfilled') {
        const { type, result: queryResult } = result.value;

        switch (type) {
          case 'equipment':
            if (queryResult.data) {
              const insertedEquipment = queryResult.data;

              // Get weapon profiles for weapons
              const weaponIds = insertedEquipment
                .filter(
                  (item: any) =>
                    (item.equipment as any)?.equipment_type === 'weapon'
                )
                .map((item: any) => item.equipment_id);

              let weaponProfiles: any[] = [];
              if (weaponIds.length > 0) {
                const { data: profilesData } = await supabase
                  .from('weapon_profiles')
                  .select('*')
                  .in('weapon_id', weaponIds);
                weaponProfiles = profilesData || [];
              }

              equipmentWithProfiles = insertedEquipment.map((item: any) => ({
                fighter_equipment_id: item.id,
                equipment_id: item.equipment_id,
                equipment_name: (item.equipment as any)?.equipment_name || '',
                equipment_type: (item.equipment as any)?.equipment_type || '',
                cost: item.purchase_cost,
                weapon_profiles: weaponProfiles.filter(
                  (wp: any) => wp.weapon_id === item.equipment_id
                ),
              }));
            } else if (queryResult.error) {
              console.warn(
                `Failed to insert equipment: ${queryResult.error.message}`
              );
            }
            break;

          case 'skills':
            if (queryResult.data) {
              insertedSkills = queryResult.data;
            } else if (queryResult.error) {
              console.warn(
                `Failed to insert skills: ${queryResult.error.message}`
              );
            }
            break;

          case 'gang_update':
            if (queryResult.error) {
              gangUpdateError = queryResult.error;
            }
            break;
        }
      } else {
        console.warn(`Promise rejected:`, result.reason);
      }
    }

    if (gangUpdateError) {
      throw new Error(
        `Failed to update gang credits: ${gangUpdateError.message}`
      );
    }

    // Revalidate paths
    revalidatePath(`/gang/${params.gang_id}`);
    revalidatePath(`/fighter/${fighterId}`);

    return {
      success: true,
      data: {
        fighter_id: fighterId,
        fighter_name: insertedFighter.fighter_name,
        fighter_type: fighterTypeData.fighter_type,
        fighter_class: fighterTypeData.fighter_class,
        fighter_class_id: fighterTypeData.fighter_class_id,
        fighter_sub_type_id: fighterTypeData.fighter_sub_type_id,
        free_skill: fighterTypeData.free_skill,
        cost: fighterCost,
        rating_cost: ratingCost,
        total_cost: fighterCost,
        stats: {
          movement: insertedFighter.movement,
          weapon_skill: insertedFighter.weapon_skill,
          ballistic_skill: insertedFighter.ballistic_skill,
          strength: insertedFighter.strength,
          toughness: insertedFighter.toughness,
          wounds: insertedFighter.wounds,
          initiative: insertedFighter.initiative,
          attacks: insertedFighter.attacks,
          leadership: insertedFighter.leadership,
          cool: insertedFighter.cool,
          willpower: insertedFighter.willpower,
          intelligence: insertedFighter.intelligence,
          xp: insertedFighter.xp,
          kills: insertedFighter.kills,
        },
        equipment: equipmentWithProfiles,
        skills: insertedSkills.map((skill) => ({
          skill_id: skill.skill_id,
          skill_name: (skill.skills as any)?.name || '',
        })),
        special_rules: fighterTypeData.special_rules,
      },
    };
  } catch (error) {
    console.error('Error in addFighterToGang server action:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
}
