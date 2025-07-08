import { createClient } from '@/utils/supabase/server';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import type { SupabaseClient } from '@supabase/supabase-js';

// Type definitions
export interface FighterBasic {
  id: string;
  fighter_name: string;
  label?: string;
  note?: string;
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
  total_xp: number;
  special_rules?: string[];
  fighter_class?: string;
  fighter_class_id?: string;
  killed?: boolean;
  starved?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  recovery?: boolean;
  free_skill?: boolean;
  kills?: number;
  gang_id: string;
  fighter_type_id: string;
  fighter_sub_type_id?: string;
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

export interface Gang {
  id: string;
  credits: number;
  gang_type_id: string;
  positioning?: Record<string, string>;
}

export interface FighterEquipment {
  fighter_equipment_id: string;
  equipment_id?: string;
  custom_equipment_id?: string;
  equipment_name: string;
  equipment_type: string;
  purchase_cost: number;
  original_cost?: number;
  is_master_crafted?: boolean;
}

export interface FighterSkill {
  id: string;
  name: string;
  credits_increase: number;
  xp_cost: number;
  is_advance: boolean;
  fighter_injury_id?: string;
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

export interface FighterVehicle {
  id: string;
  created_at: string;
  movement: number;
  front: number;
  side: number;
  rear: number;
  hull_points: number;
  handling: number;
  save: number;
  body_slots: number;
  drive_slots: number;
  engine_slots: number;
  special_rules?: string[];
  vehicle_name: string;
  vehicle_type_id: string;
  vehicle_type: string;
  cost: number;
  equipment: FighterEquipment[];
  effects: Record<string, FighterEffect[]>;
}

export interface Campaign {
  campaign_id: string;
  campaign_name: string;
  role?: string;
  status?: string;
  invited_at?: string;
  joined_at?: string;
  invited_by?: string;
  has_meat: boolean;
  has_exploration_points: boolean;
  has_scavenging_rolls: boolean;
}

export interface CompleteFighterData {
  fighter: FighterBasic & {
    fighter_type: FighterType;
    fighter_sub_type?: FighterSubType;
    skills: Record<string, FighterSkill>;
    effects: Record<string, FighterEffect[]>;
    vehicles: FighterVehicle[];
    campaigns: Campaign[];
  };
  gang: Gang;
  equipment: FighterEquipment[];
}

// Internal helper functions
async function _getFighterBasic(fighterId: string, supabase: SupabaseClient): Promise<FighterBasic> {
  const { data, error } = await supabase
    .from('fighters')
    .select(`
      id,
      fighter_name,
      label,
      note,
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
      killed,
      starved,
      retired,
      enslaved,
      recovery,
      free_skill,
      kills,
      gang_id,
      fighter_type_id,
      fighter_sub_type_id
    `)
    .eq('id', fighterId)
    .single();

  if (error) throw error;
  
  return {
    ...data,
    total_xp: data.xp, // For now, total_xp equals current xp
  };
}

async function _getFighterType(fighterTypeId: string, supabase: SupabaseClient): Promise<FighterType> {
  const { data, error } = await supabase
    .from('fighter_types')
    .select(`
      id,
      fighter_type,
      alliance_crew_name
    `)
    .eq('id', fighterTypeId)
    .single();

  if (error) throw error;
  return data;
}

async function _getFighterSubType(fighterSubTypeId: string, supabase: SupabaseClient): Promise<FighterSubType | null> {
  if (!fighterSubTypeId) return null;
  
  const { data, error } = await supabase
    .from('fighter_sub_types')
    .select(`
      id,
      sub_type_name
    `)
    .eq('id', fighterSubTypeId)
    .single();

  if (error) return null; // Sub-type is optional
  return {
    ...data,
    fighter_sub_type: data.sub_type_name
  };
}

async function _getGang(gangId: string, supabase: SupabaseClient): Promise<Gang> {
  const { data, error } = await supabase
    .from('gangs')
    .select(`
      id,
      credits,
      gang_type_id,
      positioning
    `)
    .eq('id', gangId)
    .single();

  if (error) throw error;
  return data;
}

async function _getFighterEquipment(fighterId: string, supabase: SupabaseClient): Promise<FighterEquipment[]> {
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
        equipment_type
      ),
      custom_equipment:custom_equipment_id (
        equipment_name,
        equipment_type
      )
    `)
    .eq('fighter_id', fighterId)
    .is('vehicle_id', null);

  if (error) throw error;

  return (data || []).map(item => ({
    fighter_equipment_id: item.id,
    equipment_id: item.equipment_id || undefined,
    custom_equipment_id: item.custom_equipment_id || undefined,
    equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
    equipment_type: (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type || 'unknown',
    purchase_cost: item.purchase_cost || 0,
    original_cost: item.original_cost,
    is_master_crafted: item.is_master_crafted || false,
  }));
}

async function _getFighterSkills(fighterId: string, supabase: SupabaseClient): Promise<Record<string, FighterSkill>> {
  const { data, error } = await supabase
    .from('fighter_skills')
    .select(`
      id,
      credits_increase,
      xp_cost,
      is_advance,
      fighter_injury_id,
      created_at,
      skill:skill_id (
        name
      )
    `)
    .eq('fighter_id', fighterId);

  if (error) throw error;

  const skills: Record<string, FighterSkill> = {};
  (data || []).forEach(skillData => {
    const skillName = (skillData.skill as any)?.name;
    if (skillName) {
      skills[skillName] = {
        id: skillData.id,
        name: skillName,
        credits_increase: skillData.credits_increase || 0,
        xp_cost: skillData.xp_cost || 0,
        is_advance: skillData.is_advance || false,
        fighter_injury_id: skillData.fighter_injury_id || undefined,
        acquired_at: skillData.created_at,
      };
    }
  });

  return skills;
}

async function _getFighterEffects(fighterId: string, supabase: SupabaseClient): Promise<Record<string, FighterEffect[]>> {
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
      updated_at: effectData.updated_at || undefined,
      fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
    });
  });

  return effectsByCategory;
}

async function _getFighterVehicles(fighterId: string, supabase: SupabaseClient): Promise<FighterVehicle[]> {
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

  // For each vehicle, get equipment and effects
  const vehicles: FighterVehicle[] = [];
  
  for (const vehicle of data || []) {
    // Get vehicle equipment
    const { data: equipmentData } = await supabase
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
          equipment_type
        ),
        custom_equipment:custom_equipment_id (
          equipment_name,
          equipment_type
        )
      `)
      .eq('vehicle_id', vehicle.id);

    const equipment: FighterEquipment[] = (equipmentData || []).map(item => ({
      fighter_equipment_id: item.id,
      equipment_id: item.equipment_id || undefined,
      custom_equipment_id: item.custom_equipment_id || undefined,
      equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
      equipment_type: (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type || 'unknown',
      purchase_cost: item.purchase_cost || 0,
      original_cost: item.original_cost,
      is_master_crafted: item.is_master_crafted || false,
    }));

    // Get vehicle effects
    const { data: effectsData } = await supabase
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
      .eq('vehicle_id', vehicle.id);

    const effectsByCategory: Record<string, FighterEffect[]> = {};
    (effectsData || []).forEach(effectData => {
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

    vehicles.push({
      ...vehicle,
      equipment,
      effects: effectsByCategory,
    });
  }

  return vehicles;
}

async function _getFighterCampaigns(fighterId: string, supabase: SupabaseClient): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('fighters')
    .select(`
      gang:gang_id (
        campaign_gangs (
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
        )
      )
    `)
    .eq('id', fighterId)
    .single();

  if (error) return [];

  const campaigns: Campaign[] = [];
  const campaignGangs = (data.gang as any)?.campaign_gangs || [];
  
  campaignGangs.forEach((cg: any) => {
    if (cg.campaign) {
      campaigns.push({
        campaign_id: cg.campaign.id,
        campaign_name: cg.campaign.campaign_name,
        role: cg.role,
        status: cg.status,
        invited_at: cg.invited_at,
        joined_at: cg.joined_at,
        invited_by: cg.invited_by,
        has_meat: cg.campaign.has_meat,
        has_exploration_points: cg.campaign.has_exploration_points,
        has_scavenging_rolls: cg.campaign.has_scavenging_rolls,
      });
    }
  });

  return campaigns;
}

// Main orchestration function
async function _getCompleteFighterData(fighterId: string, supabase: SupabaseClient): Promise<CompleteFighterData> {
  // Fetch basic fighter data first
  const fighterBasic = await _getFighterBasic(fighterId, supabase);
  
  // Fetch all related data in parallel
  const [
    fighterType,
    fighterSubType,
    gang,
    equipment,
    skills,
    effects,
    vehicles,
    campaigns
  ] = await Promise.all([
    _getFighterType(fighterBasic.fighter_type_id, supabase),
    _getFighterSubType(fighterBasic.fighter_sub_type_id || '', supabase),
    _getGang(fighterBasic.gang_id, supabase),
    _getFighterEquipment(fighterId, supabase),
    _getFighterSkills(fighterId, supabase),
    _getFighterEffects(fighterId, supabase),
    _getFighterVehicles(fighterId, supabase),
    _getFighterCampaigns(fighterId, supabase)
  ]);

  // Calculate total credits (including equipment, skills, effects, vehicles)
  const equipmentCost = equipment.reduce((sum, eq) => sum + eq.purchase_cost, 0);
  const skillsCost = Object.values(skills).reduce((sum, skill) => sum + skill.credits_increase, 0);
  const effectsCost = Object.values(effects).flat().reduce((sum, effect) => {
    const creditsIncrease = effect.type_specific_data?.credits_increase || 0;
    return sum + creditsIncrease;
  }, 0);
  const vehiclesCost = vehicles.reduce((sum, vehicle) => {
    const vehicleCost = vehicle.cost;
    const vehicleEquipmentCost = vehicle.equipment.reduce((eqSum, eq) => eqSum + eq.purchase_cost, 0);
    return sum + vehicleCost + vehicleEquipmentCost;
  }, 0);

  const totalCredits = fighterBasic.credits + equipmentCost + skillsCost + effectsCost + (fighterBasic.cost_adjustment || 0) + vehiclesCost;

  return {
    fighter: {
      ...fighterBasic,
      credits: totalCredits,
      fighter_type: fighterType,
      fighter_sub_type: fighterSubType || undefined,
      skills,
      effects,
      vehicles,
      campaigns,
    },
    gang,
    equipment,
  };
}

/**
 * Get complete fighter data with persistent caching
 * Cache key: complete-fighter-data-{fighterId}
 * Invalidation: Server actions only via revalidateTag()
 */
export const getCompleteFighterData = async (fighterId: string): Promise<CompleteFighterData> => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getCompleteFighterData(fighterId, supabase);
    },
    [`complete-fighter-data-${fighterId}`],
    {
      tags: [CACHE_TAGS.FIGHTER_PAGE(fighterId), 'complete-fighter-data', `complete-fighter-data-${fighterId}`],
      revalidate: false
    }
  )();
};