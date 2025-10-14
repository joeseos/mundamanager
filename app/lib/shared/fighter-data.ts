import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

// =============================================================================
// TYPES - Shared interfaces for fighter data
// =============================================================================

export interface FighterBasic {
  id: string;
  fighter_name: string;
  label?: string;
  note?: string;
  note_backstory?: string;
  credits: number;
  cost_adjustment?: number;
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
  special_rules?: string[];
  fighter_class?: string;
  fighter_class_id?: string;
  fighter_type?: string;
  fighter_type_id: string;
  custom_fighter_type_id?: string | null;
  fighter_gang_legacy_id?: string | null;
  fighter_gang_legacy?: {
    id: string;
    fighter_type_id: string;
    name?: string;
  } | null;
  fighter_sub_type_id?: string;
  killed?: boolean;
  starved?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  recovery?: boolean;
  captured?: boolean;
  free_skill?: boolean;
  kills?: number;
  gang_id: string;
  fighter_pet_id?: string;
  image_url?: string;
  position?: string;
}

export interface FighterType {
  id: string;
  fighter_type: string;
  alliance_crew_name?: string;
}

export interface FighterSubType {
  id: string;
  sub_type_name: string;
  fighter_sub_type: string;
}

export interface FighterEquipment {
  fighter_equipment_id: string;
  equipment_id?: string;
  custom_equipment_id?: string;
  equipment_name: string;
  equipment_type: string;
  equipment_category: string;
  purchase_cost: number;
  original_cost?: number;
  is_master_crafted?: boolean;
  weapon_profiles?: any[];
  target_equipment_id?: string | null;
}

export interface FighterSkill {
  id: string;
  name: string;
  credits_increase: number;
  xp_cost: number;
  is_advance: boolean;
  fighter_injury_id?: string;
  injury_name?: string;
  acquired_at: string;
}

export interface FighterEffect {
  id: string;
  effect_name: string;
  type_specific_data?: any;
  created_at: string;
  updated_at?: string;
  fighter_effect_modifiers: Array<{
    id: string;
    fighter_effect_id: string;
    stat_name: string;
    numeric_value: number;
  }>;
}

// =============================================================================
// BASE DATA FUNCTIONS - Raw database queries with proper cache tags
// =============================================================================

/**
 * Get fighter basic information (stats, name, type, etc.)
 * Cache: BASE_FIGHTER_BASIC
 */
export const getFighterBasic = async (fighterId: string, supabase: any): Promise<FighterBasic> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighters')
        .select(`
          id,
          fighter_name,
          label,
          note,
          note_backstory,
          credits,
          cost_adjustment,
          movement,
          weapon_skill,
          ballistic_skill,
          strength,
          toughness,
          wounds,
          initiative,
          attacks,
          leadership,
          cool,
          willpower,
          intelligence,
          xp,
          special_rules,
          fighter_class,
          fighter_class_id,
          fighter_type,
          fighter_type_id,
          custom_fighter_type_id,
          fighter_gang_legacy_id,
          fighter_gang_legacy:fighter_gang_legacy_id (
            id,
            fighter_type_id,
            name
          ),
          fighter_sub_type_id,
          killed,
          starved,
          retired,
          enslaved,
          recovery,
          captured,
          free_skill,
          kills,
          gang_id,
          fighter_pet_id,
          image_url,
          position
        `)
        .eq('id', fighterId)
        .single();

      if (error) throw error;
      return data;
    },
    [`fighter-basic-${fighterId}`],
    {
      tags: [CACHE_TAGS.BASE_FIGHTER_BASIC(fighterId)],
      revalidate: false
    }
  )();
};

/**
 * Get fighter equipment with weapon profiles
 * Cache: BASE_FIGHTER_EQUIPMENT
 */
export const getFighterEquipment = async (fighterId: string, supabase: any): Promise<FighterEquipment[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_equipment')
        .select(`
          id,
          equipment_id,
          custom_equipment_id,
          purchase_cost,
          original_cost,
          is_master_crafted,
          equipment:equipment_id (
            equipment_name,
            equipment_type,
            equipment_category
          ),
          custom_equipment:custom_equipment_id (
            equipment_name,
            equipment_type,
            equipment_category
          )
        `)
        .eq('fighter_id', fighterId)
        .is('vehicle_id', null);

      if (error) throw error;

      // Process each equipment item and add weapon profiles + target equipment relationship
      const equipmentWithProfiles = await Promise.all(
        (data || []).map(async (item: any) => {
          const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
          let weaponProfiles: any[] = [];
          const fighterEquipmentId = item.id;

          // Check if this equipment targets another piece of equipment (equipment-to-equipment upgrade)
          const { data: targetEffect } = await supabase
            .from('fighter_effects')
            .select('target_equipment_id')
            .eq('fighter_equipment_id', fighterEquipmentId)
            .not('target_equipment_id', 'is', null)
            .maybeSingle();

          const targetEquipmentId = targetEffect?.target_equipment_id || null;

          if (equipmentType === 'weapon') {
            if (item.equipment_id) {
              // Get standard weapon profiles
              const { data: profiles } = await supabase
                .from('weapon_profiles')
                .select(`
                  id,
                  profile_name,
                  range_short,
                  range_long,
                  acc_short,
                  acc_long,
                  strength,
                  ap,
                  damage,
                  ammo,
                  traits,
                  weapon_group_id,
                  sort_order
                `)
                .eq('weapon_id', item.equipment_id)
                .order('sort_order', { nullsFirst: false })
                .order('profile_name');

              weaponProfiles = (profiles || []).map((profile: any) => ({
                ...profile,
                is_master_crafted: item.is_master_crafted || false
              }));
            } else if (item.custom_equipment_id) {
              // Get custom weapon profiles
              const { data: profiles } = await supabase
                .from('custom_weapon_profiles')
                .select(`
                  id,
                  profile_name,
                  range_short,
                  range_long,
                  acc_short,
                  acc_long,
                  strength,
                  ap,
                  damage,
                  ammo,
                  traits,
                  weapon_group_id,
                  sort_order
                `)
                .or(`custom_equipment_id.eq.${item.custom_equipment_id},weapon_group_id.eq.${item.custom_equipment_id}`)
                .order('sort_order', { nullsFirst: false })
                .order('profile_name');

              weaponProfiles = (profiles || []).map((profile: any) => ({
                ...profile,
                is_master_crafted: item.is_master_crafted || false
              }));
            }
          }

          // If we have profiles, apply equipment-targeted effects from fighter_effects targeting this equipment
          if (weaponProfiles.length > 0) {
            const { data: targetingEffects } = await supabase
              .from('fighter_effects')
              .select(`
                id,
                fighter_effect_type_id,
                type_specific_data,
                fighter_effect_modifiers ( stat_name, numeric_value, operation )
              `)
              .eq('target_equipment_id', fighterEquipmentId);

            if (targetingEffects && targetingEffects.length > 0) {
              weaponProfiles = weaponProfiles.map((profile: any) => {
                // Work on a copy
                const modified = { ...profile };

                // Apply numeric fields with add/set
                const numericFields = ['strength', 'ap', 'damage', 'ammo'];
                const sumAdds: Record<string, number> = {};
                const setLatest: Record<string, number> = {};

                targetingEffects.forEach((eff: any) => {
                  (eff.fighter_effect_modifiers || []).forEach((m: any) => {
                    const key = m.stat_name;
                    const op = (m.operation || 'add') as 'add' | 'set';
                    const val = Number(m.numeric_value);
                    if (!Number.isFinite(val)) return;
                    if (numericFields.includes(key)) {
                      if (op === 'add') {
                        sumAdds[key] = (sumAdds[key] || 0) + val;
                      } else {
                        setLatest[key] = val;
                      }
                    }
                  });
                });

                numericFields.forEach((key) => {
                  const baseStr = (modified as any)[key];
                  const baseNum = typeof baseStr === 'string' ? parseInt(baseStr.replace('+', ''), 10) : NaN;
                  const hasBaseNum = Number.isFinite(baseNum);
                  const addVal = sumAdds[key] || 0;
                  const setVal = setLatest[key];

                  if (setVal !== undefined) {
                    // set overrides final value
                    (modified as any)[key] = key === 'ammo' ? `${setVal}+` : `${setVal}`;
                  } else if (addVal !== 0 && hasBaseNum) {
                    const newVal = baseNum + addVal;
                    (modified as any)[key] = key === 'ammo' ? `${newVal}+` : `${newVal}`;
                  }
                });

                // Traits add/remove via type_specific_data
                let traitsArr: string[] = (modified.traits || '')
                  .split(',')
                  .map((t: string) => t.trim())
                  .filter(Boolean);
                targetingEffects.forEach((eff: any) => {
                  const tsd = eff.type_specific_data || {};
                  const toRemove: string[] = tsd.traits_to_remove || [];
                  const toAdd: string[] = tsd.traits_to_add || [];
                  if (toRemove.length > 0) {
                    traitsArr = traitsArr.filter(t => !toRemove.includes(t));
                  }
                  if (toAdd.length > 0) {
                    for (const t of toAdd) {
                      if (!traitsArr.includes(t)) traitsArr.push(t);
                    }
                  }
                });
                modified.traits = traitsArr.join(', ');

                return modified;
              });
            }
          }

          return {
            fighter_equipment_id: item.id,
            equipment_id: item.equipment_id || undefined,
            custom_equipment_id: item.custom_equipment_id || undefined,
            equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
            equipment_type: equipmentType || 'unknown',
            equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
            purchase_cost: item.purchase_cost || 0,
            original_cost: item.original_cost,
            is_master_crafted: item.is_master_crafted || false,
            weapon_profiles: weaponProfiles,
            target_equipment_id: targetEquipmentId
          };
        })
      );

      return equipmentWithProfiles;
    },
    [`fighter-equipment-${fighterId}`],
    {
      tags: [CACHE_TAGS.BASE_FIGHTER_EQUIPMENT(fighterId)],
      revalidate: false
    }
  )();
};

/**
 * Get fighter skills
 * Cache: BASE_FIGHTER_SKILLS
 */
export const getFighterSkills = async (fighterId: string, supabase: any): Promise<Record<string, FighterSkill>> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_skills')
        .select(`
          id,
          credits_increase,
          xp_cost,
          is_advance,
          fighter_effect_skill_id,
          created_at,
          skill:skill_id (
            name
          ),
          fighter_effect_skills!fighter_effect_skill_id (
            fighter_effects (
              effect_name
            )
          )
        `)
        .eq('fighter_id', fighterId);

      if (error) throw error;

      const skills: Record<string, FighterSkill> = {};
      (data || []).forEach((skillData: any) => {
        const skillName = (skillData.skill as any)?.name;
        if (skillName) {
          // Get the injury name from the related fighter effect
          const injuryName = skillData.fighter_effect_skills?.fighter_effects?.effect_name;
          
          skills[skillName] = {
            id: skillData.id,
            name: skillName,
            credits_increase: skillData.credits_increase || 0,
            xp_cost: skillData.xp_cost || 0,
            is_advance: skillData.is_advance || false,
            fighter_injury_id: skillData.fighter_effect_skill_id || undefined,
            injury_name: injuryName || undefined,
            acquired_at: skillData.created_at,
          };
        }
      });

      return skills;
    },
    [`fighter-skills-${fighterId}`],
    {
      tags: [CACHE_TAGS.BASE_FIGHTER_SKILLS(fighterId)],
      revalidate: false
    }
  )();
};

/**
 * Get fighter effects/injuries
 * Cache: BASE_FIGHTER_EFFECTS
 */
export const getFighterEffects = async (fighterId: string, supabase: any): Promise<Record<string, FighterEffect[]>> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_effects')
        .select(`
          id,
          effect_name,
          type_specific_data,
          created_at,
          updated_at,
          fighter_effect_type:fighter_effect_type_id (
            fighter_effect_category:fighter_effect_category_id (
              category_name
            )
          ),
          fighter_effect_modifiers (
            id,
            fighter_effect_id,
            stat_name,
            numeric_value
          )
        `)
        .eq('fighter_id', fighterId)
        .is('vehicle_id', null);

      if (error) throw error;

      const effectsByCategory: Record<string, FighterEffect[]> = {};
      
      (data || []).forEach((effectData: any) => {
        const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized';
        
        if (!effectsByCategory[categoryName]) {
          effectsByCategory[categoryName] = [];
        }

        effectsByCategory[categoryName].push({
          id: effectData.id,
          effect_name: effectData.effect_name,
          type_specific_data: effectData.type_specific_data,
          created_at: effectData.created_at,
          updated_at: effectData.updated_at || undefined,
          fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
        });
      });

      return effectsByCategory;
    },
    [`fighter-effects-${fighterId}`],
    {
      tags: [CACHE_TAGS.BASE_FIGHTER_EFFECTS(fighterId)],
      revalidate: false
    }
  )();
};

/**
 * Get fighter vehicles
 * Cache: BASE_FIGHTER_VEHICLES
 */
export const getFighterVehicles = async (fighterId: string, supabase: any): Promise<any[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select(`
          id,
          created_at,
          movement,
          front,
          side,
          rear,
          hull_points,
          handling,
          save,
          body_slots,
          drive_slots,
          engine_slots,
          special_rules,
          vehicle_name,
          vehicle_type_id,
          vehicle_type,
          cost
        `)
        .eq('fighter_id', fighterId);

      if (error) throw error;

      // For each vehicle, get equipment and effects using shared functions
      const vehicles = await Promise.all(
        (data || []).map(async (vehicle: any) => {
          const [equipment, effects] = await Promise.all([
            getVehicleEquipment(vehicle.id, supabase),
            getVehicleEffects(vehicle.id, supabase)
          ]);

          return {
            ...vehicle,
            equipment,
            effects
          };
        })
      );

      return vehicles;
    },
    [`fighter-vehicles-${fighterId}`],
    {
      tags: [CACHE_TAGS.BASE_FIGHTER_VEHICLES(fighterId)],
      revalidate: false
    }
  )();
};

// =============================================================================
// COMPUTED DATA FUNCTIONS - Calculated values with proper cache tags
// =============================================================================

/**
 * Calculate fighter's total cost (base + equipment + skills + effects + vehicles + beasts)
 * Cache: COMPUTED_FIGHTER_TOTAL_COST
 */
export const getFighterTotalCost = async (fighterId: string, supabase: any): Promise<number> => {
  return unstable_cache(
    async () => {
      // Get all cost components in parallel
      const [fighterBasic, equipment, skills, effects, vehicles, beastCosts] = await Promise.all([
        getFighterBasic(fighterId, supabase),
        getFighterEquipment(fighterId, supabase),
        getFighterSkills(fighterId, supabase),
        getFighterEffects(fighterId, supabase),
        getFighterVehicles(fighterId, supabase),
        getFighterOwnedBeastsCost(fighterId, supabase)
      ]);

      // Check if this fighter is owned by another fighter (exotic beast)
      let isOwnedBeast = false;
      
      if (fighterBasic.fighter_pet_id) {
        const { data: ownershipData, error } = await supabase
          .from('fighter_exotic_beasts')
          .select('fighter_owner_id')
          .eq('id', fighterBasic.fighter_pet_id)
          .single();
        
        isOwnedBeast = !error && !!ownershipData;
      }

      // If this fighter is owned by another fighter, always show 0 cost
      if (isOwnedBeast) {
        return 0;
      }

      // Calculate total cost for normal fighters
      const equipmentCost = equipment.reduce((sum, eq) => sum + eq.purchase_cost, 0);
      const skillsCost = Object.values(skills).reduce((sum, skill) => sum + skill.credits_increase, 0);
      const effectsCost = Object.values(effects).flat().reduce((sum, effect) => {
        return sum + (effect.type_specific_data?.credits_increase || 0);
      }, 0);
      
      // Calculate vehicle costs (base vehicle cost + vehicle equipment + vehicle effects)
      const vehicleCost = vehicles.reduce((sum, vehicle) => {
        let vehicleTotal = vehicle.cost || 0;
        
        // Add vehicle equipment costs
        if (vehicle.equipment) {
          vehicleTotal += vehicle.equipment.reduce((equipSum: number, eq: any) => {
            return equipSum + (eq.purchase_cost || 0);
          }, 0);
        }
        
        // Add vehicle effects costs
        if (vehicle.effects) {
          vehicleTotal += Object.values(vehicle.effects).flat().reduce((effectSum: number, effect: any) => {
            return effectSum + (effect.type_specific_data?.credits_increase || 0);
          }, 0);
        }
        
        return sum + vehicleTotal;
      }, 0);
      
      return fighterBasic.credits + equipmentCost + skillsCost + effectsCost + vehicleCost +
             (fighterBasic.cost_adjustment || 0) + beastCosts;
    },
    [`fighter-total-cost-${fighterId}`],
    {
      tags: [
        CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(fighterId),
        CACHE_TAGS.SHARED_FIGHTER_COST(fighterId),
        CACHE_TAGS.BASE_FIGHTER_VEHICLES(fighterId)
      ],
      revalidate: false
    }
  )();
};

/**
 * Calculate cost of fighter's owned exotic beasts
 * Cache: COMPUTED_FIGHTER_BEAST_COSTS
 */
export const getFighterOwnedBeastsCost = async (fighterId: string, supabase: any): Promise<number> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_exotic_beasts')
        .select('fighter_pet_id')
        .eq('fighter_owner_id', fighterId);

      if (error || !data || data.length === 0) {
        return 0;
      }

      const beastIds = data.map((beast: any) => beast.fighter_pet_id);

      const { data: beastData, error: beastError } = await supabase
        .from('fighters')
        .select(`
          id,
          credits,
          cost_adjustment,
          killed,
          retired,
          enslaved,
          captured,
          fighter_type_id,
          fighter_equipment!fighter_id (purchase_cost),
          fighter_skills!fighter_id (credits_increase),
          fighter_effects!fighter_id (type_specific_data),
          fighter_types!inner (cost)
        `)
        .in('id', beastIds)
        .eq('killed', false)
        .eq('retired', false)
        .eq('enslaved', false)
        .eq('captured', false);

      if (beastError || !beastData) {
        return 0;
      }

      return beastData.reduce((total: number, beast: any) => {
        const equipmentCost = (beast.fighter_equipment as any[])?.reduce((sum, eq) => sum + (eq.purchase_cost || 0), 0) || 0;
        const skillsCost = (beast.fighter_skills as any[])?.reduce((sum, skill) => sum + (skill.credits_increase || 0), 0) || 0;
        const effectsCost = (beast.fighter_effects as any[])?.reduce((sum, effect) => {
          return sum + (effect.type_specific_data?.credits_increase || 0);
        }, 0) || 0;
        
        // Use the original fighter type cost instead of beast.credits (which is 0)
        const baseBeastCost = (beast.fighter_types as any)?.cost || 0;
        
        return total + baseBeastCost + equipmentCost + skillsCost + effectsCost + (beast.cost_adjustment || 0);
      }, 0);
    },
    [`fighter-beast-costs-${fighterId}`],
    {
      tags: [CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(fighterId)],
      revalidate: false
    }
  )();
};

// =============================================================================
// HELPER FUNCTIONS - Used by vehicle data
// =============================================================================

/**
 * Get vehicle equipment (used by getFighterVehicles)
 */
const getVehicleEquipment = async (vehicleId: string, supabase: any): Promise<any[]> => {
  const { data, error } = await supabase
    .from('fighter_equipment')
    .select(`
      id,
      equipment_id,
      custom_equipment_id,
      purchase_cost,
      is_master_crafted,
      equipment:equipment_id (
        equipment_name,
        equipment_type,
        equipment_category
      ),
      custom_equipment:custom_equipment_id (
        equipment_name,
        equipment_type,
        equipment_category
      )
    `)
    .eq('vehicle_id', vehicleId);

  if (error) return [];

  // Process equipment with weapon profiles (similar to fighter equipment)
  const equipmentWithProfiles = await Promise.all(
    (data || []).map(async (item: any) => {
      const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
      let weaponProfiles: any[] = [];

      if (equipmentType === 'weapon') {
        if (item.equipment_id) {
          const { data: profiles } = await supabase
            .from('weapon_profiles')
            .select('*')
            .eq('weapon_id', item.equipment_id)
            .order('sort_order', { nullsFirst: false })
            .order('profile_name');

          weaponProfiles = (profiles || []).map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }));
        } else if (item.custom_equipment_id) {
          const { data: profiles } = await supabase
            .from('custom_weapon_profiles')
            .select('*')
            .or(`custom_equipment_id.eq.${item.custom_equipment_id},weapon_group_id.eq.${item.custom_equipment_id}`)
            .order('sort_order', { nullsFirst: false })
            .order('profile_name');

          weaponProfiles = (profiles || []).map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }));
        }
      }

      return {
        vehicle_weapon_id: item.id,
        equipment_id: item.equipment_id || item.custom_equipment_id,
        custom_equipment_id: item.custom_equipment_id,
        equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
        equipment_type: equipmentType || 'unknown',
        equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
        purchase_cost: item.purchase_cost || 0,
        weapon_profiles: weaponProfiles
      };
    })
  );

  return equipmentWithProfiles;
};

/**
 * Get vehicle effects (used by getFighterVehicles)
 */
const getVehicleEffects = async (vehicleId: string, supabase: any): Promise<Record<string, any[]>> => {
  const { data, error } = await supabase
    .from('fighter_effects')
    .select(`
      id,
      effect_name,
      type_specific_data,
      created_at,
      updated_at,
      fighter_effect_type:fighter_effect_type_id (
        fighter_effect_category:fighter_effect_category_id (
          category_name
        )
      ),
      fighter_effect_modifiers (
        id,
        fighter_effect_id,
        stat_name,
        numeric_value
      )
    `)
    .eq('vehicle_id', vehicleId);

  if (error) return {};

  const effectsByCategory: Record<string, any[]> = {};
  
  (data || []).forEach((effectData: any) => {
    const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized';
    
    if (!effectsByCategory[categoryName]) {
      effectsByCategory[categoryName] = [];
    }

    effectsByCategory[categoryName].push({
      id: effectData.id,
      effect_name: effectData.effect_name,
      type_specific_data: effectData.type_specific_data,
      created_at: effectData.created_at,
      updated_at: effectData.updated_at,
      fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
    });
  });

  return effectsByCategory;
}

// =============================================================================
// HELPER FUNCTIONS - Reusable cached queries for fighter metadata
// =============================================================================

/**
 * Get fighter type information (cached globally)
 * Cache: GLOBAL_FIGHTER_TYPES
 */
export const getFighterTypeInfo = async (fighterTypeId: string | null, supabase: any): Promise<{
  fighter_type: string;
  alliance_crew_name?: string;
} | null> => {
  if (!fighterTypeId) return null;

  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_types')
        .select('fighter_type, alliance_crew_name')
        .eq('id', fighterTypeId)
        .single();

      if (error) return null;
      return data;
    },
    [`fighter-type-${fighterTypeId}`],
    {
      tags: [CACHE_TAGS.GLOBAL_FIGHTER_TYPES()],
      revalidate: 3600 // Fighter types rarely change
    }
  )();
};

/**
 * Get fighter sub-type information (cached globally)
 * Cache: GLOBAL_FIGHTER_TYPES
 */
export const getFighterSubTypeInfo = async (fighterSubTypeId: string, supabase: any): Promise<{
  fighter_sub_type: string;
  fighter_sub_type_id: string;
} | null> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_sub_types')
        .select('id, sub_type_name')
        .eq('id', fighterSubTypeId)
        .single();

      if (error) return null;

      return {
        fighter_sub_type: data.sub_type_name,
        fighter_sub_type_id: data.id
      };
    },
    [`fighter-sub-type-${fighterSubTypeId}`],
    {
      tags: [CACHE_TAGS.GLOBAL_FIGHTER_TYPES()],
      revalidate: 3600
    }
  )();
};

/**
 * Get exotic beast ownership information
 * Cache: fighter-exotic-beast-{petId}
 */
export const getFighterOwnershipInfo = async (fighterPetId: string, supabase: any): Promise<{
  owner_name?: string;
  beast_equipment_stashed: boolean;
} | null> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_exotic_beasts')
        .select(`
          fighter_owner_id,
          fighter_equipment_id,
          fighters!fighter_owner_id (
            fighter_name
          ),
          fighter_equipment!fighter_equipment_id (
            gang_stash
          )
        `)
        .eq('id', fighterPetId)
        .single();

      if (error || !data) return null;

      return {
        owner_name: (data.fighters as any)?.fighter_name,
        beast_equipment_stashed: data.fighter_equipment?.gang_stash || false
      };
    },
    [`fighter-ownership-${fighterPetId}`],
    {
      tags: [`fighter-exotic-beast-${fighterPetId}`],
      revalidate: false
    }
  )();
};