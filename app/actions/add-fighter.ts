'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { invalidateFighterAddition, invalidateGangRating } from '@/utils/cache-tags';
import { createExoticBeastsForEquipment } from '@/app/lib/exotic-beasts';

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
  use_base_cost_for_rating?: boolean;
  fighter_gang_legacy_id?: string;
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
    created_beasts?: Array<{
      id: string;
      fighter_name: string;
      fighter_type: string;
      fighter_class: string;
      fighter_type_id: string;
      credits: number;
      equipment_source: string;
      created_at: string;
      owner: {
        id: string;
        fighter_name: string;
      };
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
      special_rules: string[];
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
    }>;
  };
  error?: string;
}

export async function addFighterToGang(params: AddFighterParams): Promise<AddFighterResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Use provided user_id or current user's id
    const effectiveUserId = params.user_id || user.id;

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);

    // Check if this is a custom fighter type first
    const { data: customFighterData } = await supabase
      .from('custom_fighter_types')
      .select('*')
      .eq('id', params.fighter_type_id)
      .eq('user_id', user.id)
      .single();

    // Get fighter type data and gang data in parallel
    const [fighterTypeResult, gangResult] = await Promise.all([
      customFighterData ?
        Promise.resolve({ data: null, error: null }) : // Skip regular fighter type lookup for custom fighters
        supabase
          .from('fighter_types')
          .select('*')
          .eq('id', params.fighter_type_id)
          .single(),
      supabase
        .from('gangs')
        .select('id, credits, user_id, gang_type_id')
        .eq('id', params.gang_id)
        .single()
    ]);

    const { data: fighterTypeData, error: fighterTypeError } = fighterTypeResult;
    const { data: gangData, error: gangError } = gangResult;

    // For custom fighters, use custom fighter data; for regular fighters, use fighter type data
    const isCustomFighter = !!customFighterData;
    const effectiveFighterData = isCustomFighter ? customFighterData : fighterTypeData;

    if (!isCustomFighter && (fighterTypeError || !fighterTypeData)) {
      throw new Error(`Fighter type not found: ${fighterTypeError?.message || 'No data returned'}`);
    }

    if (isCustomFighter && !customFighterData) {
      throw new Error('Custom fighter type not found or not owned by user');
    }

    if (gangError || !gangData) {
      throw new Error('Gang not found');
    }

    // Check permissions - if not admin, must be gang owner
    if (!isAdmin && gangData.user_id !== effectiveUserId) {
      throw new Error('User does not have permission to add fighters to this gang');
    }

    // Check for adjusted cost based on gang type (only for regular fighters)
    let adjustedBaseCost = effectiveFighterData.cost;

    if (!isCustomFighter) {
      const { data: adjustedCostData } = await supabase
        .from('fighter_type_gang_cost')
        .select('adjusted_cost')
        .eq('fighter_type_id', params.fighter_type_id)
        .eq('gang_type_id', gangData.gang_type_id)
        .single();

      // Use adjusted cost if available, otherwise use the original cost
      adjustedBaseCost = adjustedCostData?.adjusted_cost ?? fighterTypeData.cost;
    }

    // Calculate costs
    const fighterCost = params.cost ?? adjustedBaseCost;
    const baseCost = adjustedBaseCost;
    
    // Calculate equipment cost from selected equipment
    const totalEquipmentCost = params.selected_equipment?.reduce((sum, item) => 
      sum + (item.cost * (item.quantity || 1)), 0) || 0;

    // Calculate rating cost based on use_base_cost_for_rating setting
    const ratingCost = params.use_base_cost_for_rating ? (baseCost + totalEquipmentCost) : fighterCost;

    // Check if gang has enough credits
    if (gangData.credits < fighterCost) {
      throw new Error('Not enough credits to add this fighter with equipment');
    }

    // Prepare fighter insertion data
    const fighterInsertData: any = {
      fighter_name: params.fighter_name.trimEnd(),
      gang_id: params.gang_id,
      fighter_type: effectiveFighterData.fighter_type,
      fighter_class: effectiveFighterData.fighter_class || 'Custom',
      free_skill: effectiveFighterData.free_skill || false,
      credits: ratingCost,
      movement: effectiveFighterData.movement,
      weapon_skill: effectiveFighterData.weapon_skill,
      ballistic_skill: effectiveFighterData.ballistic_skill,
      strength: effectiveFighterData.strength,
      toughness: effectiveFighterData.toughness,
      wounds: effectiveFighterData.wounds,
      initiative: effectiveFighterData.initiative,
      attacks: effectiveFighterData.attacks,
      leadership: effectiveFighterData.leadership,
      cool: effectiveFighterData.cool,
      willpower: effectiveFighterData.willpower,
      intelligence: effectiveFighterData.intelligence,
      xp: 0,
      kills: 0,
      special_rules: effectiveFighterData.special_rules,
      fighter_gang_legacy_id: params.fighter_gang_legacy_id || null,
      user_id: gangData.user_id
    };

    // Set appropriate fighter type ID field
    if (isCustomFighter) {
      fighterInsertData.custom_fighter_type_id = params.fighter_type_id;
      fighterInsertData.fighter_type_id = null;
      fighterInsertData.fighter_class_id = null;
      fighterInsertData.fighter_sub_type_id = null;
    } else {
      fighterInsertData.fighter_type_id = params.fighter_type_id;
      fighterInsertData.fighter_class_id = fighterTypeData.fighter_class_id;
      fighterInsertData.fighter_sub_type_id = fighterTypeData.fighter_sub_type_id;
      fighterInsertData.custom_fighter_type_id = null;
    }

    // Insert fighter
    const { data: insertedFighter, error: insertError } = await supabase
      .from('fighters')
      .insert(fighterInsertData)
      .select()
      .single();

    if (insertError || !insertedFighter) {
      throw new Error(`Failed to insert fighter: ${insertError?.message}`);
    }

    const fighterId = insertedFighter.id;

    // Get default skills and equipment from fighter_defaults table
    let fighterDefaultsData: any[] = [];
    let fighterDefaultEquipmentData: any[] = [];

    if (isCustomFighter) {
      // For custom fighters, use custom_fighter_type_id
      const [skillsResult, equipmentResult, customEquipmentResult] = await Promise.all([
        supabase
          .from('fighter_defaults')
          .select(`
            skill_id,
            skills!skill_id(
              id,
              name
            )
          `)
          .eq('custom_fighter_type_id', params.fighter_type_id)
          .not('skill_id', 'is', null),
        supabase
          .from('fighter_defaults')
          .select(`
            equipment_id,
            equipment!equipment_id(
              id,
              equipment_name,
              cost
            )
          `)
          .eq('custom_fighter_type_id', params.fighter_type_id)
          .not('equipment_id', 'is', null),
        supabase
          .from('fighter_defaults')
          .select(`
            custom_equipment_id,
            custom_equipment!custom_equipment_id(
              id,
              equipment_name,
              cost
            )
          `)
          .eq('custom_fighter_type_id', params.fighter_type_id)
          .not('custom_equipment_id', 'is', null)
      ]);
      fighterDefaultsData = skillsResult.data || [];

      // Combine regular and custom equipment
      const regularEquipment = equipmentResult.data || [];
      const customEquipment = (customEquipmentResult.data || []).map(item => ({
        equipment_id: `custom_${item.custom_equipment_id}`,
        equipment: {
          id: `custom_${item.custom_equipment_id}`,
          equipment_name: (item.custom_equipment as any)?.equipment_name || 'Unknown',
          cost: (item.custom_equipment as any)?.cost || 0
        }
      }));
      fighterDefaultEquipmentData = [...regularEquipment, ...customEquipment];
    } else {
      // For regular fighters, use fighter_type_id
      const [skillsResult, equipmentResult, customEquipmentResult] = await Promise.all([
        supabase
          .from('fighter_defaults')
          .select(`
            skill_id,
            skills!skill_id(
              id,
              name
            )
          `)
          .eq('fighter_type_id', params.fighter_type_id)
          .not('skill_id', 'is', null),
        supabase
          .from('fighter_defaults')
          .select(`
            equipment_id,
            equipment!equipment_id(
              id,
              equipment_name,
              cost
            )
          `)
          .eq('fighter_type_id', params.fighter_type_id)
          .not('equipment_id', 'is', null),
        supabase
          .from('fighter_defaults')
          .select(`
            custom_equipment_id,
            custom_equipment!custom_equipment_id(
              id,
              equipment_name,
              cost
            )
          `)
          .eq('fighter_type_id', params.fighter_type_id)
          .not('custom_equipment_id', 'is', null)
      ]);
      fighterDefaultsData = skillsResult.data || [];

      // Combine regular and custom equipment
      const regularEquipment = equipmentResult.data || [];
      const customEquipment = (customEquipmentResult.data || []).map(item => ({
        equipment_id: `custom_${item.custom_equipment_id}`,
        equipment: {
          id: `custom_${item.custom_equipment_id}`,
          equipment_name: (item.custom_equipment as any)?.equipment_name || 'Unknown',
          cost: (item.custom_equipment as any)?.cost || 0
        }
      }));
      fighterDefaultEquipmentData = [...regularEquipment, ...customEquipment];
    }

    // Prepare equipment insertions
    const equipmentInserts: Array<{
      fighter_id: string;
      equipment_id: string | null;
      custom_equipment_id?: string | null;
      original_cost: number;
      purchase_cost: number;
      gang_id: string;
      user_id: string;
    }> = [];

    // Add default equipment from fighter_defaults table
    if (fighterDefaultEquipmentData && fighterDefaultEquipmentData.length > 0) {
      fighterDefaultEquipmentData.forEach((defaultEquipment) => {
        const isCustomEquipment = defaultEquipment.equipment_id.startsWith('custom_');

        equipmentInserts.push({
          fighter_id: fighterId,
          equipment_id: isCustomEquipment ? null : defaultEquipment.equipment_id,
          custom_equipment_id: isCustomEquipment ? defaultEquipment.equipment_id.replace('custom_', '') : null,
          original_cost: (defaultEquipment.equipment as any)?.cost || 0,
          purchase_cost: 0, // Default equipment is free
          gang_id: params.gang_id,
          user_id: gangData.user_id
        });
      });
    }

    // Add default equipment (from params.default_equipment)
    if (params.default_equipment && params.default_equipment.length > 0) {
      params.default_equipment.forEach((defaultItem) => {
        for (let i = 0; i < (defaultItem.quantity || 1); i++) {
          const isCustomEquipment = defaultItem.equipment_id.startsWith('custom_');

          equipmentInserts.push({
            fighter_id: fighterId,
            equipment_id: isCustomEquipment ? null : defaultItem.equipment_id,
            custom_equipment_id: isCustomEquipment ? defaultItem.equipment_id.replace('custom_', '') : null,
            original_cost: defaultItem.cost || 0,
            purchase_cost: 0, // Default equipment is free
            gang_id: params.gang_id,
            user_id: gangData.user_id
          });
        }
      });
    }

    // Add selected equipment (from equipment selections)
    if (params.selected_equipment && params.selected_equipment.length > 0) {
      params.selected_equipment.forEach((selectedItem) => {
        for (let i = 0; i < (selectedItem.quantity || 1); i++) {
          const isCustomEquipment = selectedItem.equipment_id.startsWith('custom_');

          equipmentInserts.push({
            fighter_id: fighterId,
            equipment_id: isCustomEquipment ? null : selectedItem.equipment_id,
            custom_equipment_id: isCustomEquipment ? selectedItem.equipment_id.replace('custom_', '') : null,
            original_cost: selectedItem.cost,
            purchase_cost: 0, // Equipment selections are already paid for in the fighter cost
            gang_id: params.gang_id,
            user_id: gangData.user_id
          });
        }
      });
    }

    // Execute equipment and skills insertion in parallel
    const insertPromises: Promise<any>[] = [];

    // Add equipment insertion promise
    if (equipmentInserts.length > 0) {
      insertPromises.push(
        Promise.resolve(
          supabase
            .from('fighter_equipment')
            .insert(equipmentInserts)
            .select(`
              id,
              equipment_id,
              custom_equipment_id,
              original_cost,
              purchase_cost,
              equipment!equipment_id(
                id,
                equipment_name,
                equipment_type,
                equipment_category_id,
                cost
              ),
              custom_equipment!custom_equipment_id(
                id,
                equipment_name,
                equipment_type,
                equipment_category,
                cost
              )
            `)
        ).then(result => ({ type: 'equipment' as const, result }))
      );
    }

    // Add skills insertion promise
    if (fighterDefaultsData && fighterDefaultsData.length > 0) {
      const skillInserts = fighterDefaultsData.map(skill => ({
        fighter_id: fighterId,
        skill_id: skill.skill_id,
        user_id: gangData.user_id
      }));

      insertPromises.push(
        Promise.resolve(
          supabase
            .from('fighter_skills')
            .insert(skillInserts)
            .select(`
              skill_id,
              skills!skill_id(
                id,
                name
              )
            `)
        ).then(result => ({ type: 'skills' as const, result }))
      );
    }

    // Update gang credits
    insertPromises.push(
      Promise.resolve(
        supabase
          .from('gangs')
          .update({ 
            credits: gangData.credits - fighterCost,
            last_updated: new Date().toISOString()
          })
          .eq('id', params.gang_id)
      ).then(result => ({ type: 'gang_update' as const, result }))
    );

    // Execute all inserts
    const insertResults = await Promise.allSettled(insertPromises);

    // Process results with type information
    let equipmentWithProfiles: any[] = [];
    let insertedSkills: any[] = [];
    let gangUpdateError: any = null;

    // Collect exotic beast data for cache invalidation after main fighter processing
    let allCreatedBeasts: any[] = [];
    let totalBeastsRatingDelta = 0;

    for (const result of insertResults) {
      if (result.status === 'fulfilled') {
        const { type, result: queryResult } = result.value;
        
        switch (type) {
          case 'equipment':
            if (queryResult.data) {
              const insertedEquipment = queryResult.data;
              
              // Get weapon profiles for weapons (both regular and custom)
              const regularWeaponIds = insertedEquipment
                .filter((item: any) => item.equipment_id && (item.equipment as any)?.equipment_type === 'weapon')
                .map((item: any) => item.equipment_id);

              const customWeaponIds = insertedEquipment
                .filter((item: any) => item.custom_equipment_id && (item.custom_equipment as any)?.equipment_type === 'weapon')
                .map((item: any) => item.custom_equipment_id);

              let weaponProfiles: any[] = [];
              let customWeaponProfiles: any[] = [];

              // Fetch regular weapon profiles
              if (regularWeaponIds.length > 0) {
                const { data: profilesData } = await supabase
                  .from('weapon_profiles')
                  .select('*')
                  .in('weapon_id', regularWeaponIds);
                weaponProfiles = profilesData || [];
              }

              // Fetch custom weapon profiles
              if (customWeaponIds.length > 0) {
                const { data: customProfilesData } = await supabase
                  .from('custom_weapon_profiles')
                  .select('*')
                  .in('custom_equipment_id', customWeaponIds);
                customWeaponProfiles = customProfilesData || [];
              }

              // Check for exotic beast equipment and create beasts
              const exoticBeastCategoryId = '6b5eabd8-0865-439c-98bb-09bd78f0fbac';
              const exoticBeastEquipment = insertedEquipment.filter((item: any) =>
                (item.equipment as any)?.equipment_category_id === exoticBeastCategoryId ||
                (item.custom_equipment as any)?.equipment_category === 'exotic beast'
              );

              // Create exotic beasts for equipment that grants them
              let createdBeasts: any[] = [];
              let createdBeastsRatingDelta = 0;
              
              if (exoticBeastEquipment.length > 0) {
                for (const equipmentItem of exoticBeastEquipment) {
                  try {
                    const beastResult = await createExoticBeastsForEquipment({
                      equipmentId: equipmentItem.equipment_id,
                      ownerFighterId: fighterId,
                      ownerFighterName: insertedFighter.fighter_name,
                      gangId: params.gang_id,
                      userId: effectiveUserId,
                      fighterEquipmentId: equipmentItem.id
                    });

                    if (beastResult.success && beastResult.createdBeasts.length > 0) {
                      createdBeasts.push(...beastResult.createdBeasts);
                      
                      // Collect beast data for later processing
                      allCreatedBeasts.push(...beastResult.createdBeasts);
                      
                      // Calculate rating delta for created beasts
                      for (const beast of beastResult.createdBeasts) {
                        createdBeastsRatingDelta += beast.credits || 0;
                      }
                      totalBeastsRatingDelta += createdBeastsRatingDelta;
                    }
                  } catch (beastError) {
                    console.error('Error creating exotic beast for equipment:', equipmentItem.equipment_id, beastError);
                  }
                }

              }

              equipmentWithProfiles = insertedEquipment.map((item: any) => {
                const isCustomEquipment = !!item.custom_equipment_id;
                const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;

                // Get weapon profiles based on equipment type
                let itemWeaponProfiles: any[] = [];
                if (equipmentType === 'weapon') {
                  if (isCustomEquipment) {
                    itemWeaponProfiles = customWeaponProfiles.filter(
                      (wp: any) => wp.custom_equipment_id === item.custom_equipment_id
                    );
                  } else {
                    itemWeaponProfiles = weaponProfiles.filter(
                      (wp: any) => wp.weapon_id === item.equipment_id
                    );
                  }
                }

                return {
                  fighter_equipment_id: item.id,
                  equipment_id: item.equipment_id || undefined,
                  custom_equipment_id: item.custom_equipment_id || undefined,
                  equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
                  equipment_type: equipmentType || 'unknown',
                  equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
                  cost: item.purchase_cost,
                  weapon_profiles: itemWeaponProfiles
                };
              });
            } else if (queryResult.error) {
              console.warn(`Failed to insert equipment: ${queryResult.error.message}`);
            }
            break;
            
          case 'skills':
            if (queryResult.data) {
              insertedSkills = queryResult.data;
            } else if (queryResult.error) {
              console.warn(`Failed to insert skills: ${queryResult.error.message}`);
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
      throw new Error(`Failed to update gang credits: ${gangUpdateError.message}`);
    }

    // NEW: Update gang rating by fighter rating cost
    try {
      const { data: ratingRow } = await supabase
        .from('gangs')
        .select('rating')
        .eq('id', params.gang_id)
        .single();
      const currentRating = (ratingRow?.rating ?? 0) as number;
      const newRating = Math.max(0, currentRating + ratingCost + totalBeastsRatingDelta);
      await supabase
        .from('gangs')
        .update({ rating: newRating, last_updated: new Date().toISOString() })
        .eq('id', params.gang_id);
      invalidateGangRating(params.gang_id);
    } catch (e) {
      console.error('Failed to update gang rating after fighter addition:', e);
    }

    // Use granular cache invalidation for fighter addition
    invalidateFighterAddition({
      fighterId: fighterId,
      gangId: params.gang_id,
      userId: effectiveUserId
    });


    return {
      success: true,
      data: {
        fighter_id: fighterId,
        fighter_name: insertedFighter.fighter_name,
        fighter_type: effectiveFighterData.fighter_type,
        fighter_class: effectiveFighterData.fighter_class || 'Custom',
        fighter_class_id: isCustomFighter ? null : fighterTypeData.fighter_class_id,
        fighter_sub_type_id: isCustomFighter ? null : fighterTypeData.fighter_sub_type_id,
        free_skill: effectiveFighterData.free_skill || false,
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
          kills: insertedFighter.kills
        },
        equipment: equipmentWithProfiles,
        skills: insertedSkills.map(skill => ({
          skill_id: skill.skill_id,
          skill_name: (skill.skills as any)?.name || ''
        })),
        special_rules: effectiveFighterData.special_rules,
        created_beasts: allCreatedBeasts.length > 0 ? allCreatedBeasts : undefined
      }
    };

  } catch (error) {
    console.error('Error in addFighterToGang server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 