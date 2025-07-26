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
  fighter_pet_id?: string;
  image_url?: string;
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

export interface FighterExoticBeast {
  id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_class: string;
  credits: number;
  equipment_source: string;
  equipment_name: string;
  created_at: string;
  retired: boolean;
}

export interface Gang {
  id: string;
  credits: number;
  gang_type_id: string;
  positioning?: Record<string, string>;
  gang_variants?: Array<{id: string, variant: string}>;
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
    owned_beasts: FighterExoticBeast[];
    owner_name?: string | undefined;
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
      fighter_sub_type_id,
      fighter_pet_id,
      image_url
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
      positioning,
      gang_variants
    `)
    .eq('id', gangId)
    .single();

  if (error) throw error;
  
  // Fetch variant details if gang_variants is present and is an array
  let variantDetails: Array<{id: string, variant: string}> = [];
  if (data.gang_variants && Array.isArray(data.gang_variants) && data.gang_variants.length > 0) {
    const { data: variants, error: variantsError } = await supabase
      .from('gang_variant_types')
      .select('id, variant')
      .in('id', data.gang_variants);
    
    if (variantsError) {
      console.error('Error fetching gang variants:', variantsError);
    }
    
    if (!variantsError && variants) {
      variantDetails = variants.map((v: any) => ({
        id: v.id,
        variant: v.variant
      }));
    }
  }
  
  return {
    ...data,
    gang_variants: variantDetails
  };
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

  // Get beast IDs
  const beastIds = data.map(beast => beast.fighter_pet_id);

  // Fetch complete beast data with all cost components including the original beast type cost
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

async function _getFighterOwnedBeasts(fighterId: string, supabase: SupabaseClient): Promise<FighterExoticBeast[]> {
  const { data, error } = await supabase
    .from('fighter_exotic_beasts')
    .select(`
      fighter_pet_id,
      fighter_equipment_id,
      fighter_equipment!fighter_equipment_id (
        equipment!equipment_id (
          equipment_name
        ),
        custom_equipment!custom_equipment_id (
          equipment_name
        )
      )
    `)
    .eq('fighter_owner_id', fighterId);

  if (error) {
    console.error('Error fetching owned beasts:', error);
    return [];
  }

  // Now we need to manually fetch the beast fighter data since there's no direct FK relationship
  const beastIds = data?.map(beast => beast.fighter_pet_id).filter(Boolean) || [];
  
  if (beastIds.length === 0) {
    return [];
  }

  const { data: beastFighters, error: beastError } = await supabase
    .from('fighters')
    .select(`
      id,
      fighter_name,
      fighter_type,
      fighter_class,
      credits,
      created_at,
      retired
    `)
    .in('id', beastIds);

  if (beastError) {
    console.error('Error fetching beast fighters:', beastError);
    return [];
  }

  // Combine the data from both queries
  return data?.map((beastOwnership: any) => {
    const beast = beastFighters?.find(f => f.id === beastOwnership.fighter_pet_id);
    const equipment = beastOwnership.fighter_equipment?.equipment || beastOwnership.fighter_equipment?.custom_equipment;
    
    return {
      id: beast?.id || '',
      fighter_name: beast?.fighter_name || '',
      fighter_type: beast?.fighter_type || '',
      fighter_class: beast?.fighter_class || '',
      credits: beast?.credits || 0,
      equipment_source: 'Granted by equipment',
      equipment_name: equipment?.equipment_name || 'Unknown Equipment',
      created_at: beast?.created_at || '',
      retired: beast?.retired || false
    };
  }) || [];
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
    campaigns,
    ownedBeasts,
    ownedBeastsCost
  ] = await Promise.all([
    _getFighterType(fighterBasic.fighter_type_id, supabase),
    _getFighterSubType(fighterBasic.fighter_sub_type_id || '', supabase),
    _getGang(fighterBasic.gang_id, supabase),
    _getFighterEquipment(fighterId, supabase),
    _getFighterSkills(fighterId, supabase),
    _getFighterEffects(fighterId, supabase),
    _getFighterVehicles(fighterId, supabase),
    _getFighterCampaigns(fighterId, supabase),
    _getFighterOwnedBeasts(fighterId, supabase),
    _getFighterOwnedBeastsCost(fighterId, supabase)
  ]);

  // Check if this fighter is owned by another fighter
  let ownershipData = null;
  let ownershipError = null;
  
  if (fighterBasic.fighter_pet_id) {
    // Fighter has a pet_id, so it's owned - get the owner info via the ownership record
    const { data, error } = await supabase
      .from('fighter_exotic_beasts')
      .select(`
        fighter_owner_id,
        fighters!fighter_owner_id (
          fighter_name
        )
      `)
      .eq('id', fighterBasic.fighter_pet_id)
      .single();
    
    ownershipData = data;
    ownershipError = error;
  }

  // Log for debugging if needed
  // console.log('Fighter ownership check:', { fighterId, hasPetId: fighterBasic.fighter_pet_id, ownerName: ownershipData ? (ownershipData.fighters as any)?.fighter_name : 'No owner' });

  // Calculate total credits (including equipment, skills, effects, vehicles, owned beasts)
  // BUT: Fighters owned by other fighters always show 0 credits regardless of advancements
  let totalCredits: number;
  
  if (ownershipData && !ownershipError) {
    // This fighter is owned by another fighter - always show 0 cost (actual cost attributed to owner)
    totalCredits = 0;
  } else {
    // Normal fighters: calculate total cost including owned beasts
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

    totalCredits = fighterBasic.credits + equipmentCost + skillsCost + effectsCost + (fighterBasic.cost_adjustment || 0) + vehiclesCost + ownedBeastsCost;
  }

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
      owned_beasts: ownedBeasts,
      owner_name: (ownershipData && !ownershipError) ? (ownershipData.fighters as any)?.fighter_name : undefined,
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
      tags: [CACHE_TAGS.FIGHTER_PAGE(fighterId), CACHE_TAGS.FIGHTER_VEHICLE_DATA(fighterId), 'complete-fighter-data', `complete-fighter-data-${fighterId}`],
      revalidate: false
    }
  )();
};