'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { invalidateFighterAddition } from '@/utils/cache-tags';
import { createExoticBeastsForEquipment } from '@/utils/exotic-beasts';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { logFighterAction } from '@/app/actions/logs/fighter-logs';

interface SelectedEquipment {
  equipment_id: string;
  cost: number;
  quantity?: number;
  effect_ids?: string[];
  is_editable?: boolean;
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
    base_stats: {
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
    };
    current_stats: {
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
    };
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
    applied_effects?: Array<{
      id: string;
      effect_name: string;
      type_specific_data?: any;
      created_at: string;
      category_name?: string;
      fighter_effect_modifiers: Array<{
        id: string;
        fighter_effect_id: string;
        stat_name: string;
        numeric_value: number;
      }>;
    }>;
  };
  error?: string;
}


async function applyEffectsForEquipmentOptimized(
  supabase: any,
  effectTypes: any[], // Pre-fetched effect types
  fighterEquipmentId: string,
  fighterId: string,
  userId: string,
  includeCreditIncrease: boolean = false
): Promise<{ appliedEffects: any[], effectsCreditsIncrease: number }> {
  if (!effectTypes || effectTypes.length === 0) {
    return { appliedEffects: [], effectsCreditsIncrease: 0 };
  }

  try {
    // Batch insert effects using pre-fetched data (no additional queries)
    const effectsToInsert = effectTypes.map((effectType: any) => ({
      fighter_id: fighterId,
      vehicle_id: null,
      fighter_effect_type_id: effectType.id,
      effect_name: effectType.effect_name,
      type_specific_data: effectType.type_specific_data,
      fighter_equipment_id: fighterEquipmentId,
      user_id: userId
    }));

    const { data: insertedEffects, error: effectsError } = await supabase
      .from('fighter_effects')
      .insert(effectsToInsert)
      .select('id, fighter_effect_type_id');

    if (effectsError || !insertedEffects) {
      console.error('Failed to insert effects:', effectsError);
      return { appliedEffects: [], effectsCreditsIncrease: 0 };
    }

    // Batch insert modifiers using pre-fetched modifier data
    const allModifiers: any[] = [];
    effectTypes.forEach((effectType: any, index: number) => {
      const effectId = insertedEffects[index].id;
      if (effectType.fighter_effect_type_modifiers) {
        effectType.fighter_effect_type_modifiers.forEach((modifier: any) => {
          allModifiers.push({
            fighter_effect_id: effectId,
            stat_name: modifier.stat_name,
            numeric_value: modifier.default_numeric_value
          });
        });
      }
    });

    if (allModifiers.length > 0) {
      const { error: modifiersError } = await supabase.from('fighter_effect_modifiers').insert(allModifiers);
      if (modifiersError) {
        console.error('Failed to insert effect modifiers:', modifiersError);
      }
    }

    // Build applied effects response using pre-fetched data (no additional queries)
    const appliedEffects: any[] = [];
    let totalCreditsIncrease = 0;

    effectTypes.forEach((effectType: any, index: number) => {
      const insertedEffect = insertedEffects[index];
      if (insertedEffect) {
        // Get modifiers for this specific effect from the batch we just inserted
        const effectModifiers = allModifiers.filter(mod => mod.fighter_effect_id === insertedEffect.id);

        appliedEffects.push({
          id: insertedEffect.id,
          effect_name: effectType.effect_name,
          type_specific_data: effectType.type_specific_data,
          created_at: new Date().toISOString(),
          category_name: effectType.fighter_effect_categories?.category_name,
          fighter_effect_modifiers: effectModifiers
        });

        // Only calculate credits increase if explicitly requested
        if (includeCreditIncrease) {
          const creditsIncrease = effectType.type_specific_data?.credits_increase || 0;
          totalCreditsIncrease += creditsIncrease;
        }
      }
    });

    return { appliedEffects, effectsCreditsIncrease: totalCreditsIncrease };

  } catch (error) {
    console.error('Equipment effect application failed:', error);
    return { appliedEffects: [], effectsCreditsIncrease: 0 };
  }
}

function calculateStatsWithEffects(baseStats: any, appliedEffects: any[]) {
  const modifiedStats = { ...baseStats };

  appliedEffects.forEach(effect => {
    if (effect.fighter_effect_modifiers?.length > 0) {
      effect.fighter_effect_modifiers.forEach((modifier: any) => {
        const statName = modifier.stat_name.toLowerCase();
        const value = modifier.numeric_value;

        const statMapping: Record<string, string> = {
          'movement': 'movement',
          'weapon_skill': 'weapon_skill',
          'ballistic_skill': 'ballistic_skill',
          'strength': 'strength',
          'toughness': 'toughness',
          'wounds': 'wounds',
          'initiative': 'initiative',
          'attacks': 'attacks',
          'leadership': 'leadership',
          'cool': 'cool',
          'willpower': 'willpower',
          'intelligence': 'intelligence'
        };

        const statKey = statMapping[statName];
        if (statKey && modifiedStats[statKey] !== undefined) {
          modifiedStats[statKey] += value;
        }
      });
    }
  });

  return modifiedStats;
}

export async function addFighterToGang(params: AddFighterParams): Promise<AddFighterResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Use current user's id
    const effectiveUserId = user.id;

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);

    // Check if this is a custom fighter type first (owned by user OR shared to their campaigns)
    let customFighterData = null;

    // First try to get fighter if user owns it
    const { data: ownedFighter } = await supabase
      .from('custom_fighter_types')
      .select('*')
      .eq('id', params.fighter_type_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ownedFighter) {
      customFighterData = ownedFighter;
    } else {
      // Check if fighter is shared to user's campaigns
      const { data: userCampaigns } = await supabase
        .from('campaign_members')
        .select('campaign_id')
        .eq('user_id', user.id);

      const campaignIds = userCampaigns?.map(cm => cm.campaign_id) || [];

      if (campaignIds.length > 0) {
        // Check if this fighter is shared to any of user's campaigns
        const { data: sharedFighter } = await supabase
          .from('custom_shared')
          .select('custom_fighter_type_id')
          .eq('custom_fighter_type_id', params.fighter_type_id)
          .in('campaign_id', campaignIds)
          .limit(1)
          .maybeSingle();

        if (sharedFighter) {
          // Fetch the actual fighter data
          const { data: fighterData } = await supabase
            .from('custom_fighter_types')
            .select('*')
            .eq('id', params.fighter_type_id)
            .single();

          customFighterData = fighterData;
        }
      }
    }

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

    // Note: Authorization is enforced by RLS policies on fighters table

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

    // Check if gang has enough credits (only if fighter cost > 0)
    if (fighterCost > 0 && gangData.credits < fighterCost) {
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

    // Get all defaults (skills and equipment) in a single query
    const { data: allDefaultsData } = await supabase
      .from('fighter_defaults')
      .select(`
        skill_id,
        equipment_id,
        custom_equipment_id,
        skills!skill_id(
          id,
          name
        ),
        equipment!equipment_id(
          id,
          equipment_name,
          cost,
          equipment_type,
          is_editable
        ),
        custom_equipment!custom_equipment_id(
          id,
          equipment_name,
          cost,
          equipment_type,
          is_editable
        )
      `)
      .eq(isCustomFighter ? 'custom_fighter_type_id' : 'fighter_type_id', params.fighter_type_id);

    // Process results to separate skills and equipment
    fighterDefaultsData = (allDefaultsData || []).filter(item => item.skill_id && item.skills);

    fighterDefaultEquipmentData = (allDefaultsData || [])
      .filter(item => item.equipment_id || item.custom_equipment_id)
      .map(item => {
        if (item.equipment_id && item.equipment) {
          return {
            equipment_id: item.equipment_id,
            equipment: item.equipment,
            is_editable: (item.equipment as any)?.is_editable || false
          };
        } else if (item.custom_equipment_id && item.custom_equipment) {
          return {
            equipment_id: `custom_${item.custom_equipment_id}`,
            equipment: {
              id: `custom_${item.custom_equipment_id}`,
              equipment_name: (item.custom_equipment as any)?.equipment_name || 'Unknown',
              cost: (item.custom_equipment as any)?.cost || 0
            },
            is_editable: (item.custom_equipment as any)?.is_editable || false
          };
        }
        return null;
      }).filter(Boolean);

    // Prepare equipment insertions with deduplication
    const equipmentInserts: Array<{
      fighter_id: string;
      equipment_id: string | null;
      custom_equipment_id?: string | null;
      original_cost: number;
      purchase_cost: number;
      gang_id: string;
      user_id: string;
      is_editable?: boolean;
    }> = [];

    // Track added equipment to prevent cross-source duplicates
    const addedEquipment = new Set<string>();

    // Add default equipment from fighter_defaults table (highest priority)
    // Push directly to allow multiple copies of the same equipment
    if (fighterDefaultEquipmentData && fighterDefaultEquipmentData.length > 0) {
      fighterDefaultEquipmentData.forEach((defaultEquipment: any) => {
        const isCustomEquipment = defaultEquipment.equipment_id.startsWith('custom_');
        // Track for cross-source deduplication (prevents params.default_equipment from duplicating)
        addedEquipment.add(defaultEquipment.equipment_id);
        equipmentInserts.push({
          fighter_id: fighterId,
          equipment_id: isCustomEquipment ? null : defaultEquipment.equipment_id,
          custom_equipment_id: isCustomEquipment ? defaultEquipment.equipment_id.replace('custom_', '') : null,
          original_cost: (defaultEquipment.equipment as any)?.cost || 0,
          purchase_cost: 0, // Default equipment is free
          gang_id: params.gang_id,
          user_id: gangData.user_id,
          is_editable: defaultEquipment.is_editable || false
        });
      });
    }

    // Add default equipment (from params.default_equipment) - only if not already added from fighter_defaults
    if (params.default_equipment && params.default_equipment.length > 0) {
      params.default_equipment.forEach((defaultItem) => {
        // Check once before the loop - if already from fighter_defaults, skip entirely
        if (!addedEquipment.has(defaultItem.equipment_id)) {
          addedEquipment.add(defaultItem.equipment_id);
          for (let i = 0; i < (defaultItem.quantity || 1); i++) {
            const isCustomEquipment = defaultItem.equipment_id.startsWith('custom_');
            equipmentInserts.push({
              fighter_id: fighterId,
              equipment_id: isCustomEquipment ? null : defaultItem.equipment_id,
              custom_equipment_id: isCustomEquipment ? defaultItem.equipment_id.replace('custom_', '') : null,
              original_cost: defaultItem.cost || 0,
              purchase_cost: 0, // Default equipment is free
              gang_id: params.gang_id,
              user_id: gangData.user_id,
              is_editable: defaultItem.is_editable || false
            });
          }
        }
      });
    }

    // Add selected equipment (from equipment selections) - these should be unique
    if (params.selected_equipment && params.selected_equipment.length > 0) {
      params.selected_equipment.forEach((selectedItem) => {
        for (let i = 0; i < (selectedItem.quantity || 1); i++) {
          const isCustomEquipment = selectedItem.equipment_id.startsWith('custom_');
          // Don't deduplicate selected equipment - user explicitly chose these
          equipmentInserts.push({
            fighter_id: fighterId,
            equipment_id: isCustomEquipment ? null : selectedItem.equipment_id,
            custom_equipment_id: isCustomEquipment ? selectedItem.equipment_id.replace('custom_', '') : null,
            original_cost: selectedItem.cost,
            purchase_cost: 0, // Equipment selections are already paid for in the fighter cost
            gang_id: params.gang_id,
            user_id: gangData.user_id,
            is_editable: selectedItem.is_editable || false
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
              is_editable,
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

    // Collect equipment effects data
    let allAppliedEffects: any[] = [];
    let totalEffectsCreditsIncrease = 0;

    for (const result of insertResults) {
      if (result.status === 'fulfilled') {
        const { type, result: queryResult } = result.value;
        
        switch (type) {
          case 'equipment':
            if (queryResult.data) {
              const insertedEquipment = queryResult.data;

              // Apply equipment effects automatically for ALL equipment (OPTIMIZED)
              // Filter valid equipment IDs for batch processing
              const validEquipmentIds = insertedEquipment
                .filter((item: any) => item.equipment_id && !item.custom_equipment_id)
                .map((item: any) => item.equipment_id);

              if (validEquipmentIds.length > 0) {
                try {
                  // OPTIMIZED: Single batch query for all equipment effects
                  const { data: allEffectTypes, error: batchQueryError } = await supabase
                    .from('fighter_effect_types')
                    .select(`
                      id,
                      effect_name,
                      fighter_effect_category_id,
                      type_specific_data,
                      fighter_effect_categories (
                        id,
                        category_name
                      ),
                      fighter_effect_type_modifiers (
                        stat_name,
                        default_numeric_value
                      )
                    `)
                    .in('type_specific_data->>equipment_id', validEquipmentIds);

                  if (!batchQueryError && allEffectTypes && allEffectTypes.length > 0) {
                    // Group effects by equipment_id for processing
                    const effectsByEquipment = new Map<string, any[]>();
                    allEffectTypes.forEach(effectType => {
                      const equipmentId = effectType.type_specific_data?.equipment_id;
                      if (equipmentId) {
                        if (!effectsByEquipment.has(equipmentId)) {
                          effectsByEquipment.set(equipmentId, []);
                        }
                        effectsByEquipment.get(equipmentId)!.push(effectType);
                      }
                    });

                    // Filter to ONLY auto-apply fixed effects (exclude editable effects that user adds later)
                    const fixedEffectsByEquipment = new Map<string, any[]>();
                    Array.from(effectsByEquipment.entries()).forEach(([equipmentId, effects]) => {
                      const fixedEffects = effects.filter((et: any) => {
                        // Only exclude effects marked as editable (user adds these via edit modal after purchase)
                        return et?.type_specific_data?.is_editable !== true;
                      });

                      if (fixedEffects.length > 0) {
                        fixedEffectsByEquipment.set(equipmentId, fixedEffects);
                      }
                    });

                    // Apply effects for each equipment piece
                    for (const equipmentItem of insertedEquipment) {
                      if (!equipmentItem.equipment_id || equipmentItem.custom_equipment_id) continue;

                      const effectsForThisEquipment = fixedEffectsByEquipment.get(equipmentItem.equipment_id) || [];

                      if (effectsForThisEquipment.length > 0) {
                        try {
                          const effectsResult = await applyEffectsForEquipmentOptimized(
                            supabase,
                            effectsForThisEquipment,
                            equipmentItem.id,
                            fighterId,
                            effectiveUserId,
                            false // Don't include credit increase for fighter creation
                          );

                          allAppliedEffects.push(...effectsResult.appliedEffects);
                          totalEffectsCreditsIncrease += effectsResult.effectsCreditsIncrease;
                        } catch (effectError) {
                          console.error('Error applying effects for equipment:', equipmentItem.equipment_id, effectError);
                        }
                      }
                    }
                  }
                } catch (batchError) {
                  console.error('Error in batch effect processing:', batchError);
                }
              }

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
                      userId: gangData.user_id,
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
                  weapon_profiles: itemWeaponProfiles,
                  is_editable: item.is_editable || false
                };
              });

              // Handle equipment grants (equipment that automatically includes other items)
              // NOTE: Only "fixed" type grants are processed during fighter creation because:
              // - There's no UI flow to show selection options during the add-fighter process
              // - "single_select" and "multiple_select" grants require user interaction
              // - For equipment with selection-based grants purchased during fighter creation,
              //   those grants will be skipped (the equipment itself is still added)
              // - Users can later purchase equipment with selection grants via the normal purchase flow
              const standardEquipmentItems = insertedEquipment.filter(
                (item: any) => item.equipment_id && !item.custom_equipment_id
              );

              if (standardEquipmentItems.length > 0) {
                const equipmentIds = standardEquipmentItems.map((item: any) => item.equipment_id);

                // Fetch equipment that grants other equipment (JSONB grants_equipment)
                const { data: equipmentWithGrantsData } = await supabase
                  .from('equipment')
                  .select('id, grants_equipment')
                  .in('id', equipmentIds)
                  .not('grants_equipment', 'is', null);

                if (equipmentWithGrantsData && equipmentWithGrantsData.length > 0) {
                  // Collect all equipment IDs that need to be granted (only fixed type)
                  const allGrantedEquipmentIds: string[] = [];
                  const grantsMap: Map<string, { parentEquipId: string; additionalCost: number }[]> = new Map();

                  for (const parentEquip of equipmentWithGrantsData) {
                    const grantsConfig = parentEquip.grants_equipment as {
                      selection_type: string;
                      options: { equipment_id: string; additional_cost: number }[];
                    } | null;

                    // Only process fixed type grants
                    if (grantsConfig?.selection_type === 'fixed' && grantsConfig.options?.length > 0) {
                      for (const option of grantsConfig.options) {
                        allGrantedEquipmentIds.push(option.equipment_id);
                        if (!grantsMap.has(option.equipment_id)) {
                          grantsMap.set(option.equipment_id, []);
                        }
                        grantsMap.get(option.equipment_id)!.push({
                          parentEquipId: parentEquip.id,
                          additionalCost: option.additional_cost
                        });
                      }
                    }
                  }

                  if (allGrantedEquipmentIds.length > 0) {
                    // Fetch granted equipment details
                    const { data: grantedEquipmentDetails } = await supabase
                      .from('equipment')
                      .select('id, equipment_name, cost')
                      .in('id', allGrantedEquipmentIds);

                    if (grantedEquipmentDetails && grantedEquipmentDetails.length > 0) {
                      const grantedInserts = [];

                      for (const grantedEquip of grantedEquipmentDetails) {
                        const parentInfos = grantsMap.get(grantedEquip.id) || [];

                        for (const parentInfo of parentInfos) {
                          const parentFighterEquip = standardEquipmentItems.find(
                            (item: any) => item.equipment_id === parentInfo.parentEquipId
                          );

                          if (parentFighterEquip) {
                            grantedInserts.push({
                              fighter_id: fighterId,
                              equipment_id: grantedEquip.id,
                              original_cost: grantedEquip.cost,
                              purchase_cost: parentInfo.additionalCost,
                              granted_by_equipment_id: parentFighterEquip.id,
                              gang_id: params.gang_id,
                              user_id: gangData.user_id
                            });
                          }
                        }
                      }

                      if (grantedInserts.length > 0) {
                        await supabase
                          .from('fighter_equipment')
                          .insert(grantedInserts);
                      }
                    }
                  }
                }
              }
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

    // Update gang rating and wealth by fighter rating cost
    await updateGangFinancials(supabase, {
      gangId: params.gang_id,
      ratingDelta: ratingCost + totalBeastsRatingDelta,
      creditsDelta: -fighterCost // Negative because credits were spent
    });

    // Use granular cache invalidation for fighter addition
    invalidateFighterAddition({
      fighterId: fighterId,
      gangId: params.gang_id,
      userId: effectiveUserId
    });

    // Log fighter addition
    try {
      await logFighterAction({
        gang_id: params.gang_id,
        fighter_id: fighterId,
        fighter_name: insertedFighter.fighter_name,
        action_type: 'fighter_added',
        fighter_credits: ratingCost,
        user_id: effectiveUserId
      });
    } catch (logError) {
      console.error('Failed to log fighter addition:', logError);
    }

    // Calculate base and modified stats
    const baseStats = {
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
    };

    // Calculate stats with effects applied for optimistic updates
    const currentStats = calculateStatsWithEffects(baseStats, allAppliedEffects);

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
        // Base stats (original values before effects)
        base_stats: {
          movement: baseStats.movement,
          weapon_skill: baseStats.weapon_skill,
          ballistic_skill: baseStats.ballistic_skill,
          strength: baseStats.strength,
          toughness: baseStats.toughness,
          wounds: baseStats.wounds,
          initiative: baseStats.initiative,
          attacks: baseStats.attacks,
          leadership: baseStats.leadership,
          cool: baseStats.cool,
          willpower: baseStats.willpower,
          intelligence: baseStats.intelligence
        },
        // Current stats (after effects applied) for immediate display
        current_stats: {
          movement: currentStats.movement,
          weapon_skill: currentStats.weapon_skill,
          ballistic_skill: currentStats.ballistic_skill,
          strength: currentStats.strength,
          toughness: currentStats.toughness,
          wounds: currentStats.wounds,
          initiative: currentStats.initiative,
          attacks: currentStats.attacks,
          leadership: currentStats.leadership,
          cool: currentStats.cool,
          willpower: currentStats.willpower,
          intelligence: currentStats.intelligence
        },
        // Legacy stats field for backward compatibility (use current stats)
        stats: currentStats,
        equipment: equipmentWithProfiles,
        skills: insertedSkills.map(skill => ({
          skill_id: skill.skill_id,
          skill_name: (skill.skills as any)?.name || ''
        })),
        special_rules: effectiveFighterData.special_rules,
        created_beasts: allCreatedBeasts.length > 0 ? allCreatedBeasts : undefined,
        applied_effects: allAppliedEffects.length > 0 ? allAppliedEffects : undefined
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