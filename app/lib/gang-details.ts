'use server'

import { createClient } from '@/utils/supabase/server';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import type { SupabaseClient } from '@supabase/supabase-js';

interface GangDetailsResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Type definitions
interface GangBasic {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  gang_colour: string;
  credits: number;
  reputation: number;
  meat: number;
  scavenging_rolls: number;
  exploration_points: number;
  alignment: string;
  positioning?: Record<string, any>;
  note?: string;
  created_at: string;
  last_updated: string;
  alliance_id?: string;
  gang_variants?: string[];
}

interface GangType {
  image_url: string;
}

interface Alliance {
  alliance_name: string;
  alliance_type: string;
}

// Use inline types for gang data structures since they're only used internally

// Helper functions
async function _getGangBasic(gangId: string, supabase: SupabaseClient): Promise<GangBasic> {
  const { data, error } = await supabase
    .from('gangs')
    .select(`
      id,
      name,
      gang_type,
      gang_type_id,
      gang_colour,
      credits,
      reputation,
      meat,
      scavenging_rolls,
      exploration_points,
      alignment,
      positioning,
      note,
      created_at,
      last_updated,
      alliance_id,
      gang_variants
    `)
    .eq('id', gangId)
    .single();

  if (error) throw error;
  return data;
}

async function _getGangType(gangTypeId: string, supabase: SupabaseClient): Promise<GangType> {
  const { data, error } = await supabase
    .from('gang_types')
    .select('image_url')
    .eq('gang_type_id', gangTypeId)
    .single();

  if (error) throw error;
  return data;
}

async function _getAlliance(allianceId: string | undefined, supabase: SupabaseClient): Promise<Alliance | null> {
  if (!allianceId) return null;
  
  const { data, error } = await supabase
    .from('alliances')
    .select(`
      alliance_name,
      alliance_type
    `)
    .eq('id', allianceId)
    .single();

  if (error) return null;
  return data;
}

async function _getGangFighters(gangId: string, supabase: SupabaseClient): Promise<any[]> {
  // Get all fighter IDs for this gang
  const { data: fighterIds, error: fighterIdsError } = await supabase
    .from('fighters')
    .select('id')
    .eq('gang_id', gangId);

  if (fighterIdsError || !fighterIds) return [];

  // Use the same logic as fighter-details.ts but for multiple fighters
  const fighters: any[] = [];
  
  for (const fighter of fighterIds) {
    try {
      // Get complete fighter data (reusing existing logic)
      const { data: fighterData, error: fighterError } = await supabase
        .from('fighters')
        .select(`
          id,
          fighter_name,
          label,
          fighter_type,
          fighter_class,
          fighter_type_id,
          fighter_sub_type_id,
          position,
          xp,
          kills,
          credits,
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
          cost_adjustment,
          special_rules,
          note,
          killed,
          starved,
          retired,
          enslaved,
          recovery,
          free_skill,
          image_url,
          fighter_types!inner (
            alliance_crew_name
          ),
          fighter_sub_types (
            sub_type_name
          )
        `)
        .eq('id', fighter.id)
        .single();

      if (fighterError || !fighterData) continue;

      // Calculate total fighter cost including beast costs
      const [equipment, skills, effects, vehicles, beastCosts] = await Promise.all([
        _getFighterEquipment(fighter.id, supabase),
        _getFighterSkills(fighter.id, supabase),
        _getFighterEffects(fighter.id, supabase),
        _getFighterVehicles(fighter.id, supabase),
        _getFighterOwnedBeastsCost(fighter.id, supabase)
      ]);

      // Check if this fighter is owned by another fighter (i.e., is an exotic beast)
      const { data: ownershipData, error: ownershipError } = await supabase
        .from('fighter_exotic_beasts')
        .select(`
          fighter_owner_id,
          fighters!fighter_owner_id (
            fighter_name
          )
        `)
        .eq('fighter_pet_id', fighter.id)
        .single();


      // If query fails (fighter is not owned by anyone), ownershipData will be null

      // Calculate total fighter cost including beast costs
      // BUT: Fighters owned by other fighters always show 0 credits regardless of advancements
      let totalCredits: number;
      
      if (ownershipData && !ownershipError) {
        // This fighter is owned by another fighter - always show 0 cost (actual cost attributed to owner)
        totalCredits = 0;
      } else {
        // Normal fighters: calculate total cost including owned beasts
        const equipmentCost = equipment.reduce((sum: number, eq: any) => sum + (eq.cost || 0), 0);
        const skillsCost = Object.values(skills).reduce((sum: number, skill: any) => sum + (skill.credits_increase || 0), 0);
        const effectsCost = Object.values(effects).flat().reduce((sum: number, effect: any) => {
          return sum + (effect.type_specific_data?.credits_increase || 0);
        }, 0);
        const vehiclesCost = vehicles.reduce((sum: number, vehicle: any) => {
          return sum + (vehicle.cost || 0) + (vehicle.total_equipment_cost || 0) + (vehicle.total_effect_credits || 0);
        }, 0);

        totalCredits = (fighterData.credits || 0) + equipmentCost + skillsCost + effectsCost + 
                      (fighterData.cost_adjustment || 0) + vehiclesCost + beastCosts;
      }

      fighters.push({
        id: fighterData.id,
        fighter_name: fighterData.fighter_name,
        label: fighterData.label,
        fighter_type: fighterData.fighter_type,
        fighter_class: fighterData.fighter_class,
        fighter_sub_type: fighterData.fighter_sub_types ? {
          fighter_sub_type: (fighterData.fighter_sub_types as any).sub_type_name,
          fighter_sub_type_id: fighterData.fighter_sub_type_id
        } : undefined,
        alliance_crew_name: (fighterData.fighter_types as any)?.alliance_crew_name,
        position: fighterData.position,
        xp: fighterData.xp,
        kills: fighterData.kills,
        credits: totalCredits,
        movement: fighterData.movement,
        weapon_skill: fighterData.weapon_skill,
        ballistic_skill: fighterData.ballistic_skill,
        strength: fighterData.strength,
        toughness: fighterData.toughness,
        wounds: fighterData.wounds,
        initiative: fighterData.initiative,
        attacks: fighterData.attacks,
        leadership: fighterData.leadership,
        cool: fighterData.cool,
        willpower: fighterData.willpower,
        intelligence: fighterData.intelligence,
        equipment,
        effects,
        skills,
        vehicles,
        cost_adjustment: fighterData.cost_adjustment,
        special_rules: fighterData.special_rules || [],
        note: fighterData.note,
        killed: fighterData.killed,
        starved: fighterData.starved,
        retired: fighterData.retired,
        enslaved: fighterData.enslaved,
        recovery: fighterData.recovery,
        free_skill: fighterData.free_skill,
        image_url: fighterData.image_url,
        owner_name: (ownershipData && !ownershipError) ? (ownershipData.fighters as any)?.fighter_name : undefined,
      });
    } catch (error) {
      console.error(`Error processing fighter ${fighter.id}:`, error);
      continue;
    }
  }

  return fighters;
}

// Helper functions for fighter data (with weapon profiles support)
async function _getFighterEquipment(fighterId: string, supabase: SupabaseClient): Promise<any[]> {
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
    .eq('fighter_id', fighterId)
    .is('vehicle_id', null);

  if (error) return [];

  // Process each equipment item and add weapon profiles
  const equipmentWithProfiles = await Promise.all(
    (data || []).map(async (item) => {
      const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
      let weaponProfiles: any[] = [];

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

          weaponProfiles = (profiles || []).map(profile => ({
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

          weaponProfiles = (profiles || []).map(profile => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }));
        }
      }

      return {
        fighter_weapon_id: item.id,
        equipment_id: item.equipment_id || item.custom_equipment_id,
        custom_equipment_id: item.custom_equipment_id,
        equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
        equipment_type: equipmentType || 'unknown',
        equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
        cost: item.purchase_cost || 0,
        weapon_profiles: weaponProfiles
      };
    })
  );

  return equipmentWithProfiles;
}

async function _getFighterSkills(fighterId: string, supabase: SupabaseClient): Promise<Record<string, any>> {
  const { data, error } = await supabase
    .from('fighter_skills')
    .select(`
      id,
      credits_increase,
      xp_cost,
      is_advance,
      created_at,
      skill:skill_id (
        name
      )
    `)
    .eq('fighter_id', fighterId);

  if (error) return {};

  const skills: Record<string, any> = {};
  (data || []).forEach(skillData => {
    const skillName = (skillData.skill as any)?.name;
    if (skillName) {
      skills[skillName] = {
        id: skillData.id,
        credits_increase: skillData.credits_increase || 0,
        xp_cost: skillData.xp_cost || 0,
        is_advance: skillData.is_advance || false,
        acquired_at: skillData.created_at,
      };
    }
  });

  return skills;
}

async function _getFighterEffects(fighterId: string, supabase: SupabaseClient): Promise<Record<string, any[]>> {
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

  if (error) return {};

  const effectsByCategory: Record<string, any[]> = {};
  
  (data || []).forEach(effectData => {
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

async function _getFighterVehicles(fighterId: string, supabase: SupabaseClient): Promise<any[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(`
      id,
      created_at,
      vehicle_type_id,
      vehicle_type,
      cost,
      vehicle_name,
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
      body_slots_occupied,
      drive_slots_occupied,
      engine_slots_occupied,
      special_rules
    `)
    .eq('fighter_id', fighterId);

  if (error) return [];

  // Get equipment and effects for each vehicle
  const vehiclesWithDetails = await Promise.all(
    (data || []).map(async (vehicle) => {
      const [equipment, effects] = await Promise.all([
        _getVehicleEquipment(vehicle.id, supabase),
        _getVehicleEffects(vehicle.id, supabase)
      ]);

      const equipmentCost = equipment.reduce((sum: number, eq: any) => sum + (eq.cost || 0), 0);
      const effectsCost = Object.values(effects).flat().reduce((sum: number, effect: any) => {
        return sum + (effect.type_specific_data?.credits_increase || 0);
      }, 0);

      return {
        ...vehicle,
        equipment,
        total_equipment_cost: equipmentCost,
        effects,
        total_effect_credits: effectsCost
      };
    })
  );

  return vehiclesWithDetails;
}

// Reuse the beast costs function from fighter-details.ts
async function _getFighterOwnedBeastsCost(fighterId: string, supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('fighter_exotic_beasts')
    .select(`
      fighter_pet_id
    `)
    .eq('fighter_owner_id', fighterId);

  if (error || !data || data.length === 0) {
    return 0;
  }

  const beastIds = data.map(beast => beast.fighter_pet_id);

  const { data: beastData, error: beastError } = await supabase
    .from('fighters')
    .select(`
      id,
      credits,
      cost_adjustment,
      killed,
      retired,
      enslaved,
      fighter_type_id,
      fighter_equipment!fighter_id (purchase_cost),
      fighter_skills!fighter_id (credits_increase),
      fighter_effects!fighter_id (type_specific_data),
      fighter_types!inner (cost)
    `)
    .in('id', beastIds)
    .eq('killed', false)
    .eq('retired', false)
    .eq('enslaved', false);

  if (beastError || !beastData) {
    return 0;
  }

  return beastData.reduce((total, beast) => {
    const equipmentCost = (beast.fighter_equipment as any[])?.reduce((sum, eq) => sum + (eq.purchase_cost || 0), 0) || 0;
    const skillsCost = (beast.fighter_skills as any[])?.reduce((sum, skill) => sum + (skill.credits_increase || 0), 0) || 0;
    const effectsCost = (beast.fighter_effects as any[])?.reduce((sum, effect) => {
      return sum + (effect.type_specific_data?.credits_increase || 0);
    }, 0) || 0;
    
    // Use the original fighter type cost instead of beast.credits (which is 0)
    const baseBeastCost = (beast.fighter_types as any)?.cost || 0;
    
    return total + baseBeastCost + equipmentCost + skillsCost + effectsCost + (beast.cost_adjustment || 0);
  }, 0);
}

async function _getGangVehicles(gangId: string, supabase: SupabaseClient): Promise<any[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(`
      id,
      created_at,
      vehicle_type_id,
      vehicle_type,
      cost,
      vehicle_name,
      body_slots_occupied,
      drive_slots_occupied,
      engine_slots_occupied,
      special_rules,
      vehicle_types!inner (
        movement,
        front,
        side,
        rear,
        hull_points,
        handling,
        save,
        body_slots,
        drive_slots,
        engine_slots
      )
    `)
    .eq('gang_id', gangId)
    .is('fighter_id', null);

  if (error) return [];

  // Get equipment and effects for each gang vehicle
  const vehiclesWithDetails = await Promise.all(
    (data || []).map(async (vehicle) => {
      const [equipment, effects] = await Promise.all([
        _getVehicleEquipment(vehicle.id, supabase),
        _getVehicleEffects(vehicle.id, supabase)
      ]);

      const equipmentCost = equipment.reduce((sum: number, eq: any) => sum + (eq.cost || 0), 0);
      const effectsCost = Object.values(effects).flat().reduce((sum: number, effect: any) => {
        return sum + (effect.type_specific_data?.credits_increase || 0);
      }, 0);

      return {
        id: vehicle.id,
        created_at: vehicle.created_at,
        vehicle_type_id: vehicle.vehicle_type_id,
        vehicle_type: vehicle.vehicle_type,
        cost: vehicle.cost,
        vehicle_name: vehicle.vehicle_name,
        movement: (vehicle.vehicle_types as any).movement,
        front: (vehicle.vehicle_types as any).front,
        side: (vehicle.vehicle_types as any).side,
        rear: (vehicle.vehicle_types as any).rear,
        hull_points: (vehicle.vehicle_types as any).hull_points,
        handling: (vehicle.vehicle_types as any).handling,
        save: (vehicle.vehicle_types as any).save,
        body_slots: (vehicle.vehicle_types as any).body_slots,
        drive_slots: (vehicle.vehicle_types as any).drive_slots,
        engine_slots: (vehicle.vehicle_types as any).engine_slots,
        body_slots_occupied: vehicle.body_slots_occupied,
        drive_slots_occupied: vehicle.drive_slots_occupied,
        engine_slots_occupied: vehicle.engine_slots_occupied,
        special_rules: vehicle.special_rules || [],
        equipment,
        total_equipment_cost: equipmentCost,
        effects,
        total_effect_credits: effectsCost
      };
    })
  );

  return vehiclesWithDetails;
}

async function _getGangStash(gangId: string, supabase: SupabaseClient): Promise<any[]> {
  const { data, error } = await supabase
    .from('gang_stash')
    .select(`
      id,
      created_at,
      equipment_id,
      custom_equipment_id,
      cost,
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
    .eq('gang_id', gangId);

  if (error) return [];

  return (data || []).map(item => ({
    id: item.id,
    created_at: item.created_at,
    equipment_id: item.equipment_id,
    custom_equipment_id: item.custom_equipment_id,
    equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
    equipment_type: (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type || 'unknown',
    equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
    cost: item.cost,
    type: 'equipment'
  }));
}

async function _getGangCampaigns(gangId: string, supabase: SupabaseClient): Promise<any[]> {
  const { data, error } = await supabase
    .from('campaign_gangs')
    .select(`
      role,
      status,
      invited_at,
      joined_at,
      invited_by,
      campaign:campaign_id (
        id,
        campaign_name,
        has_meat,
        has_exploration_points,
        has_scavenging_rolls
      )
    `)
    .eq('gang_id', gangId);

  if (error) return [];

  const campaigns: any[] = [];
  
  for (const cg of data || []) {
    if (cg.campaign) {
      // Get territories for this campaign
      const { data: territories } = await supabase
        .from('campaign_territories')
        .select(`
          id,
          created_at,
          territory_id,
          territory_name,
          ruined
        `)
        .eq('campaign_id', (cg.campaign as any).id)
        .eq('gang_id', gangId);

      campaigns.push({
        campaign_id: (cg.campaign as any).id,
        campaign_name: (cg.campaign as any).campaign_name,
        role: cg.role,
        status: cg.status,
        invited_at: cg.invited_at,
        joined_at: cg.joined_at,
        invited_by: cg.invited_by,
        has_meat: (cg.campaign as any).has_meat,
        has_exploration_points: (cg.campaign as any).has_exploration_points,
        has_scavenging_rolls: (cg.campaign as any).has_scavenging_rolls,
        territories: territories || []
      });
    }
  }

  return campaigns;
}

async function _getGangVariants(gangBasic: GangBasic, supabase: SupabaseClient): Promise<any[]> {
  if (!gangBasic.gang_variants || gangBasic.gang_variants.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('gang_variant_types')
    .select('id, variant')
    .in('id', gangBasic.gang_variants);

  if (error) return [];

  return (data || []).map(variant => ({
    id: variant.id,
    variant: variant.variant
  }));
}

// Helper functions for vehicle equipment and effects
async function _getVehicleEquipment(vehicleId: string, supabase: SupabaseClient): Promise<any[]> {
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

  // Process each equipment item and add weapon profiles
  const equipmentWithProfiles = await Promise.all(
    (data || []).map(async (item) => {
      const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
      let weaponProfiles: any[] = [];

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

          weaponProfiles = (profiles || []).map(profile => ({
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

          weaponProfiles = (profiles || []).map(profile => ({
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
        cost: item.purchase_cost || 0,
        weapon_profiles: weaponProfiles
      };
    })
  );

  return equipmentWithProfiles;
}

async function _getVehicleEffects(vehicleId: string, supabase: SupabaseClient): Promise<Record<string, any[]>> {
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
  
  (data || []).forEach(effectData => {
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

// Main orchestration function
async function _getGangDetails(gangId: string, supabase: SupabaseClient): Promise<GangDetailsResult> {
  try {
    // Fetch basic gang data first
    const gangBasic = await _getGangBasic(gangId, supabase);
    
    // Fetch all related data in parallel
    const [
      gangType,
      alliance,
      fighters,
      vehicles,
      stash,
      campaigns,
      gangVariants
    ] = await Promise.all([
      _getGangType(gangBasic.gang_type_id, supabase),
      _getAlliance(gangBasic.alliance_id, supabase),
      _getGangFighters(gangId, supabase),
      _getGangVehicles(gangId, supabase),
      _getGangStash(gangId, supabase),
      _getGangCampaigns(gangId, supabase),
      _getGangVariants(gangBasic, supabase)
    ]);

    // Calculate gang rating (same logic as SQL function)
    const gangRating = fighters
      .filter(f => !f.killed && !f.retired && !f.enslaved)
      .reduce((total, fighter) => {
        // Exclude exotic beasts from direct rating calculation (their costs are already in owner's credits)
        if (fighter.fighter_class === 'exotic beast') {
          return total;
        }
        return total + fighter.credits;
      }, 0);

    const gangData = {
      id: gangBasic.id,
      name: gangBasic.name,
      gang_type: gangBasic.gang_type,
      gang_type_id: gangBasic.gang_type_id,
      gang_type_image_url: gangType.image_url,
      gang_colour: gangBasic.gang_colour,
      credits: gangBasic.credits,
      reputation: gangBasic.reputation,
      meat: gangBasic.meat,
      scavenging_rolls: gangBasic.scavenging_rolls,
      exploration_points: gangBasic.exploration_points,
      rating: gangRating,
      alignment: gangBasic.alignment,
      positioning: gangBasic.positioning,
      note: gangBasic.note,
      stash: stash,
      created_at: gangBasic.created_at,
      last_updated: gangBasic.last_updated,
      fighters: fighters,
      campaigns: campaigns,
      vehicles: vehicles,
      alliance_id: gangBasic.alliance_id,
      alliance_name: alliance?.alliance_name,
      alliance_type: alliance?.alliance_type,
      gang_variants: gangVariants
    };

    return {
      success: true,
      data: gangData
    };
  } catch (error) {
    console.error('Error in _getGangDetails:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Cached version of gang details data - migrated from RPC to pure TypeScript
 * Includes complete gang data with fighters, vehicles, stash, campaigns, and beast costs
 * 
 * Cache Tags Used:
 * - GANG_OVERVIEW: Gang basic info, stash, campaigns, vehicles
 * - GANG_CREDITS: Gang credits (invalidated by equipment purchases)  
 * - GANG_RATING: Gang rating calculated from fighters (including beast costs)
 * - GANG_FIGHTERS_LIST: All fighters with equipment, skills, effects
 */
export async function getGangDetails(gangId: string): Promise<GangDetailsResult> {
  try {
    const supabase = await createClient();
    
    return unstable_cache(
      async () => {
        return _getGangDetails(gangId, supabase);
      },
      [`gang-details-${gangId}`],
      {
        tags: [
          CACHE_TAGS.GANG_OVERVIEW(gangId),    // Gang basic info, stash, vehicles
          CACHE_TAGS.GANG_CREDITS(gangId),     // Gang credits (auto-invalidated by equipment)
          CACHE_TAGS.GANG_RATING(gangId),      // Gang rating (auto-invalidated by equipment)
          CACHE_TAGS.GANG_FIGHTERS_LIST(gangId) // All fighters data (auto-invalidated by equipment)
        ],
        revalidate: false // Only revalidate when tags are invalidated
      }
    )();
  } catch (error) {
    console.error('Error in getGangDetails:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}