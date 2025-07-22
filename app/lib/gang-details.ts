'use server'

import { createClient } from '@/utils/supabase/server';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

interface GangDetailsResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Internal helper function that fetches gang details using direct SQL queries
 * This function is not cached and should only be called by the cached wrapper
 */
async function _getGangDetails(gangId: string, supabase: any): Promise<GangDetailsResult> {
  try {
    // Main gang query with basic info
    const { data: gangData, error: gangError } = await supabase
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
        gang_variants,
        gang_types!inner(image_url),
        alliances(alliance_name, alliance_type)
      `)
      .eq('id', gangId)
      .single();

    if (gangError) {
      console.error('Error fetching gang data:', gangError);
      throw gangError;
    }

    if (!gangData) {
      return {
        success: false,
        error: 'Gang not found'
      };
    }

    // Get fighters with all related data
    const { data: fightersData, error: fightersError } = await supabase
      .from('fighters')
      .select(`
        id,
        fighter_name,
        label,
        fighter_type,
        fighter_type_id,
        fighter_class,
        fighter_sub_type_id,
        xp,
        kills,
        position,
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
        credits,
        cost_adjustment,
        special_rules,
        note,
        killed,
        starved,
        retired,
        enslaved,
        recovery,
        free_skill,
        fighter_types!inner(alliance_crew_name),
        fighter_sub_types(id, sub_type_name)
      `)
      .eq('gang_id', gangId);

    if (fightersError) {
      console.error('Error fetching fighters:', fightersError);
      throw fightersError;
    }

    // Get fighter equipment
    const fighterIds = fightersData?.map((f: any) => f.id) || [];
    let fighterEquipmentData = [];
    
    if (fighterIds.length > 0) {
      const { data: equipmentData, error: equipmentError } = await supabase
        .from('fighter_equipment')
        .select(`
          id,
          fighter_id,
          vehicle_id,
          equipment_id,
          custom_equipment_id,
          purchase_cost,
          is_master_crafted,
          equipment(id, equipment_name, equipment_type, equipment_category),
          custom_equipment(id, equipment_name, equipment_type, equipment_category)
        `)
        .in('fighter_id', fighterIds);

      if (equipmentError) {
        console.error('Error fetching fighter equipment:', equipmentError);
        throw equipmentError;
      }

      fighterEquipmentData = equipmentData || [];
    }

    // Get weapon profiles for equipment
    const equipmentIds = fighterEquipmentData
      .filter((eq: any) => eq.equipment_id)
      .map((eq: any) => eq.equipment_id);
    
    let weaponProfilesData = [];
    if (equipmentIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('weapon_profiles')
        .select('*')
        .in('weapon_id', equipmentIds);

      if (profilesError) {
        console.error('Error fetching weapon profiles:', profilesError);
        throw profilesError;
      }

      weaponProfilesData = profilesData || [];
    }

    // Get custom weapon profiles
    const customEquipmentIds = fighterEquipmentData
      .filter((eq: any) => eq.custom_equipment_id)
      .map((eq: any) => eq.custom_equipment_id);
    
    let customWeaponProfilesData = [];
    if (customEquipmentIds.length > 0) {
      const { data: customProfilesData, error: customProfilesError } = await supabase
        .from('custom_weapon_profiles')
        .select('*')
        .or(`custom_equipment_id.in.(${customEquipmentIds.join(',')}),weapon_group_id.in.(${customEquipmentIds.join(',')})`);

      if (customProfilesError) {
        console.error('Error fetching custom weapon profiles:', customProfilesError);
        throw customProfilesError;
      }

      customWeaponProfilesData = customProfilesData || [];
    }

    // Get fighter skills
    let fighterSkillsData = [];
    if (fighterIds.length > 0) {
      const { data: skillsData, error: skillsError } = await supabase
        .from('fighter_skills')
        .select(`
          id,
          fighter_id,
          skill_id,
          credits_increase,
          xp_cost,
          is_advance,
          created_at,
          skills(name)
        `)
        .in('fighter_id', fighterIds);

      if (skillsError) {
        console.error('Error fetching fighter skills:', skillsError);
        throw skillsError;
      }

      fighterSkillsData = skillsData || [];
    }

    // Get fighter effects
    let fighterEffectsData = [];
    if (fighterIds.length > 0) {
      const { data: effectsData, error: effectsError } = await supabase
        .from('fighter_effects')
        .select(`
          id,
          fighter_id,
          vehicle_id,
          effect_name,
          type_specific_data,
          created_at,
          updated_at,
          fighter_effect_type_id,
          fighter_effect_types(
            id,
            effect_name,
            fighter_effect_category_id,
            fighter_effect_categories(id, category_name)
          )
        `)
        .in('fighter_id', fighterIds);

      if (effectsError) {
        console.error('Error fetching fighter effects:', effectsError);
        throw effectsError;
      }

      fighterEffectsData = effectsData || [];
    }

    // Get fighter effect modifiers
    const effectIds = fighterEffectsData.map((effect: any) => effect.id);
    let fighterEffectModifiersData = [];
    
    if (effectIds.length > 0) {
      const { data: modifiersData, error: modifiersError } = await supabase
        .from('fighter_effect_modifiers')
        .select('*')
        .in('fighter_effect_id', effectIds);

      if (modifiersError) {
        console.error('Error fetching fighter effect modifiers:', modifiersError);
        throw modifiersError;
      }

      fighterEffectModifiersData = modifiersData || [];
    }

    // Get vehicles
    const { data: vehiclesData, error: vehiclesError } = await supabase
      .from('vehicles')
      .select(`
        id,
        fighter_id,
        gang_id,
        created_at,
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
        vehicle_name,
        cost,
        vehicle_type_id,
        vehicle_type,
        vehicle_types(
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
          special_rules
        )
      `)
      .or(`gang_id.eq.${gangId},fighter_id.in.(${fighterIds.join(',')})`);

    if (vehiclesError) {
      console.error('Error fetching vehicles:', vehiclesError);
      throw vehiclesError;
    }

    // Get vehicle equipment
    const vehicleIds = vehiclesData?.map((v: any) => v.id) || [];
    let vehicleEquipmentData = [];
    
    if (vehicleIds.length > 0) {
      const { data: vEquipmentData, error: vEquipmentError } = await supabase
        .from('fighter_equipment')
        .select(`
          id,
          fighter_id,
          vehicle_id,
          equipment_id,
          custom_equipment_id,
          purchase_cost,
          is_master_crafted,
          equipment(id, equipment_name, equipment_type, equipment_category),
          custom_equipment(id, equipment_name, equipment_type, equipment_category)
        `)
        .in('vehicle_id', vehicleIds);

      if (vEquipmentError) {
        console.error('Error fetching vehicle equipment:', vEquipmentError);
        throw vEquipmentError;
      }

      vehicleEquipmentData = vEquipmentData || [];
    }

    // Get gang stash
    const { data: stashData, error: stashError } = await supabase
      .from('gang_stash')
      .select(`
        id,
        created_at,
        equipment_id,
        custom_equipment_id,
        cost,
        equipment(equipment_name, equipment_type, equipment_category),
        custom_equipment(equipment_name, equipment_type, equipment_category)
      `)
      .eq('gang_id', gangId);

    if (stashError) {
      console.error('Error fetching gang stash:', stashError);
      throw stashError;
    }

    // Get campaigns
    const { data: campaignsData, error: campaignsError } = await supabase
      .from('campaign_gangs')
      .select(`
        campaign_id,
        role,
        status,
        invited_at,
        joined_at,
        invited_by,
        campaigns(
          id,
          campaign_name,
          has_meat,
          has_exploration_points,
          has_scavenging_rolls
        )
      `)
      .eq('gang_id', gangId);

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError);
      throw campaignsError;
    }

    // Get campaign territories
    const campaignIds = campaignsData?.map((c: any) => c.campaign_id) || [];
    let territoriesData = [];
    
    if (campaignIds.length > 0) {
      const { data: terrData, error: terrError } = await supabase
        .from('campaign_territories')
        .select('*')
        .eq('gang_id', gangId)
        .in('campaign_id', campaignIds);

      if (terrError) {
        console.error('Error fetching territories:', terrError);
        throw terrError;
      }

      territoriesData = terrData || [];
    }

    // Get gang variants
    let gangVariantsData = [];
    if (gangData.gang_variants && Array.isArray(gangData.gang_variants)) {
      const { data: variantsData, error: variantsError } = await supabase
        .from('gang_variant_types')
        .select('id, variant')
        .in('id', gangData.gang_variants);

      if (variantsError) {
        console.error('Error fetching gang variants:', variantsError);
        throw variantsError;
      }

      gangVariantsData = variantsData || [];
    }

    // Transform and structure the data
    const transformedData = transformGangData({
      gangData,
      fightersData: fightersData || [],
      fighterEquipmentData,
      weaponProfilesData,
      customWeaponProfilesData,
      fighterSkillsData,
      fighterEffectsData,
      fighterEffectModifiersData,
      vehiclesData: vehiclesData || [],
      vehicleEquipmentData,
      stashData: stashData || [],
      campaignsData: campaignsData || [],
      territoriesData,
      gangVariantsData
    });

    return {
      success: true,
      data: transformedData
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
 * Transform raw database data into the expected gang details format
 */
function transformGangData({
  gangData,
  fightersData,
  fighterEquipmentData,
  weaponProfilesData,
  customWeaponProfilesData,
  fighterSkillsData,
  fighterEffectsData,
  fighterEffectModifiersData,
  vehiclesData,
  vehicleEquipmentData,
  stashData,
  campaignsData,
  territoriesData,
  gangVariantsData
}: any) {
  // Group data by fighter/vehicle IDs for easier lookup
  const equipmentByFighter = groupBy(fighterEquipmentData.filter((eq: any) => eq.fighter_id), 'fighter_id');
  const equipmentByVehicle = groupBy(vehicleEquipmentData, 'vehicle_id');
  const skillsByFighter = groupBy(fighterSkillsData, 'fighter_id');
  const effectsByFighter = groupBy(fighterEffectsData.filter((eff: any) => eff.fighter_id), 'fighter_id');
  const effectsByVehicle = groupBy(fighterEffectsData.filter((eff: any) => eff.vehicle_id), 'vehicle_id');
  const modifiersByEffect = groupBy(fighterEffectModifiersData, 'fighter_effect_id');
  const territoriesByCampaign = groupBy(territoriesData, 'campaign_id');
  const vehiclesByFighter = groupBy(vehiclesData.filter((v: any) => v.fighter_id), 'fighter_id');
  const gangOwnedVehicles = vehiclesData.filter((v: any) => !v.fighter_id && v.gang_id === gangData.id);

  // Transform fighters
  const transformedFighters = fightersData.map((fighter: any) => {
    const fighterEquipment = equipmentByFighter[fighter.id] || [];
    const fighterSkills = skillsByFighter[fighter.id] || [];
    const fighterEffects = effectsByFighter[fighter.id] || [];
    const fighterVehicles = vehiclesByFighter[fighter.id] || [];

    // Transform equipment
    const equipment = fighterEquipment.map((eq: any) => {
      const equipmentInfo = eq.equipment || eq.custom_equipment;
      const profiles = getWeaponProfiles(eq, weaponProfilesData, customWeaponProfilesData);
      
      return {
        fighter_weapon_id: eq.id,
        equipment_id: equipmentInfo?.id,
        custom_equipment_id: eq.custom_equipment_id,
        equipment_name: equipmentInfo?.equipment_name,
        equipment_type: equipmentInfo?.equipment_type,
        equipment_category: equipmentInfo?.equipment_category,
        cost: eq.purchase_cost,
        weapon_profiles: profiles.length > 0 ? profiles : null
      };
    });

    // Transform skills
    const skills = fighterSkills.reduce((acc: any, skill: any) => {
      acc[skill.skills.name] = {
        id: skill.id,
        credits_increase: skill.credits_increase,
        xp_cost: skill.xp_cost,
        is_advance: skill.is_advance,
        acquired_at: skill.created_at
      };
      return acc;
    }, {});

    // Transform effects
    const effects = transformEffects(fighterEffects, modifiersByEffect);

    // Transform vehicles
    const vehicles = fighterVehicles.map((vehicle: any) => transformVehicle(vehicle, equipmentByVehicle, effectsByVehicle, modifiersByEffect, weaponProfilesData, customWeaponProfilesData));

    // Calculate total credits
    const equipmentCost = fighterEquipment.reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0);
    const skillsCost = fighterSkills.reduce((sum: number, skill: any) => sum + (skill.credits_increase || 0), 0);
    const effectsCost = fighterEffects.reduce((sum: number, effect: any) => {
      const creditsIncrease = effect.type_specific_data?.credits_increase;
      return sum + (creditsIncrease ? parseInt(creditsIncrease) : 0);
    }, 0);
    const vehicleCost = fighterVehicles.reduce((sum: number, vehicle: any) => {
      const vEquipment = equipmentByVehicle[vehicle.id] || [];
      const vEffects = effectsByVehicle[vehicle.id] || [];
      const vEquipmentCost = vEquipment.reduce((vSum: number, eq: any) => vSum + (eq.purchase_cost || 0), 0);
      const vEffectsCost = vEffects.reduce((vSum: number, effect: any) => {
        const creditsIncrease = effect.type_specific_data?.credits_increase;
        return vSum + (creditsIncrease ? parseInt(creditsIncrease) : 0);
      }, 0);
      return sum + (vehicle.cost || 0) + vEquipmentCost + vEffectsCost;
    }, 0);

    const totalCredits = (fighter.credits || 0) + equipmentCost + skillsCost + effectsCost + (fighter.cost_adjustment || 0) + vehicleCost;

    return {
      id: fighter.id,
      fighter_name: fighter.fighter_name,
      label: fighter.label,
      fighter_type: fighter.fighter_type,
      fighter_class: fighter.fighter_class,
      fighter_sub_type: {
        fighter_sub_type: fighter.fighter_sub_types?.sub_type_name,
        fighter_sub_type_id: fighter.fighter_sub_types?.id
      },
      alliance_crew_name: fighter.fighter_types?.alliance_crew_name,
      position: fighter.position,
      xp: fighter.xp,
      kills: fighter.kills,
      credits: totalCredits,
      movement: fighter.movement,
      weapon_skill: fighter.weapon_skill,
      ballistic_skill: fighter.ballistic_skill,
      strength: fighter.strength,
      toughness: fighter.toughness,
      wounds: fighter.wounds,
      initiative: fighter.initiative,
      attacks: fighter.attacks,
      leadership: fighter.leadership,
      cool: fighter.cool,
      willpower: fighter.willpower,
      intelligence: fighter.intelligence,
      equipment,
      effects,
      skills,
      vehicles,
      cost_adjustment: fighter.cost_adjustment,
      special_rules: fighter.special_rules || [],
      note: fighter.note,
      killed: fighter.killed,
      starved: fighter.starved,
      retired: fighter.retired,
      enslaved: fighter.enslaved,
      recovery: fighter.recovery,
      free_skill: fighter.free_skill
    };
  });

  // Calculate gang rating (sum of active fighter credits)
  const rating = transformedFighters
    .filter((f: any) => !f.killed && !f.retired && !f.enslaved)
    .reduce((sum: number, f: any) => sum + f.credits, 0);

  // Transform gang-owned vehicles
  const transformedVehicles = gangOwnedVehicles.map((vehicle: any) => 
    transformVehicle(vehicle, equipmentByVehicle, effectsByVehicle, modifiersByEffect, weaponProfilesData, customWeaponProfilesData)
  );

  // Transform stash
  const stash = stashData.map((item: any) => {
    const equipmentInfo = item.equipment || item.custom_equipment;
    return {
      id: item.id,
      created_at: item.created_at,
      equipment_id: item.equipment_id,
      custom_equipment_id: item.custom_equipment_id,
      equipment_name: equipmentInfo?.equipment_name,
      equipment_type: equipmentInfo?.equipment_type,
      equipment_category: equipmentInfo?.equipment_category,
      cost: item.cost,
      type: 'equipment'
    };
  });

  // Transform campaigns
  const campaigns = campaignsData.map((campaign: any) => {
    const territories = territoriesByCampaign[campaign.campaign_id] || [];
    return {
      campaign_id: campaign.campaigns.id,
      campaign_name: campaign.campaigns.campaign_name,
      role: campaign.role,
      status: campaign.status,
      invited_at: campaign.invited_at,
      joined_at: campaign.joined_at,
      invited_by: campaign.invited_by,
      has_meat: campaign.campaigns.has_meat,
      has_exploration_points: campaign.campaigns.has_exploration_points,
      has_scavenging_rolls: campaign.campaigns.has_scavenging_rolls,
      territories: territories.map((territory: any) => ({
        id: territory.id,
        created_at: territory.created_at,
        territory_id: territory.territory_id,
        territory_name: territory.territory_name,
        ruined: territory.ruined
      }))
    };
  });

  return {
    id: gangData.id,
    name: gangData.name,
    gang_type: gangData.gang_type,
    gang_type_id: gangData.gang_type_id,
    gang_type_image_url: gangData.gang_types?.image_url,
    gang_colour: gangData.gang_colour,
    credits: gangData.credits,
    reputation: gangData.reputation,
    meat: gangData.meat,
    scavenging_rolls: gangData.scavenging_rolls,
    exploration_points: gangData.exploration_points,
    rating,
    alignment: gangData.alignment,
    positioning: gangData.positioning,
    note: gangData.note,
    stash,
    created_at: gangData.created_at,
    last_updated: gangData.last_updated,
    fighters: transformedFighters,
    campaigns,
    vehicles: transformedVehicles,
    alliance_id: gangData.alliance_id,
    alliance_name: gangData.alliances?.alliance_name,
    alliance_type: gangData.alliances?.alliance_type,
    gang_variants: gangVariantsData
  };
}

/**
 * Helper function to group array items by a key
 */
function groupBy(array: any[], key: string) {
  return array.reduce((groups, item) => {
    const group = item[key];
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(item);
    return groups;
  }, {});
}

/**
 * Get weapon profiles for equipment
 */
function getWeaponProfiles(equipment: any, weaponProfilesData: any[], customWeaponProfilesData: any[]) {
  if (equipment.equipment_id) {
    return weaponProfilesData
      .filter(profile => profile.weapon_id === equipment.equipment_id)
      .map(profile => ({
        ...profile,
        is_master_crafted: equipment.is_master_crafted
      }))
      .sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999));
  }
  
  if (equipment.custom_equipment_id) {
    return customWeaponProfilesData
      .filter(profile => 
        profile.custom_equipment_id === equipment.custom_equipment_id || 
        profile.weapon_group_id === equipment.custom_equipment_id
      )
      .map(profile => ({
        ...profile,
        is_master_crafted: equipment.is_master_crafted
      }))
      .sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999));
  }
  
  return [];
}

/**
 * Transform effects data into the expected format
 */
function transformEffects(effects: any[], modifiersByEffect: any) {
  const effectsByCategory = effects.reduce((acc: any, effect: any) => {
    const categoryName = effect.fighter_effect_types?.fighter_effect_categories?.category_name || 'uncategorized';
    if (!acc[categoryName]) {
      acc[categoryName] = [];
    }
    
    const modifiers = modifiersByEffect[effect.id] || [];
    acc[categoryName].push({
      id: effect.id,
      effect_name: effect.effect_name,
      type_specific_data: effect.type_specific_data,
      created_at: effect.created_at,
      updated_at: effect.updated_at,
      fighter_effect_modifiers: modifiers.map((mod: any) => ({
        id: mod.id,
        fighter_effect_id: mod.fighter_effect_id,
        stat_name: mod.stat_name,
        numeric_value: mod.numeric_value
      }))
    });
    
    return acc;
  }, {});
  
  return effectsByCategory;
}

/**
 * Transform vehicle data
 */
function transformVehicle(vehicle: any, equipmentByVehicle: any, effectsByVehicle: any, modifiersByEffect: any, weaponProfilesData: any[], customWeaponProfilesData: any[]) {
  const vEquipment = equipmentByVehicle[vehicle.id] || [];
  const vEffects = effectsByVehicle[vehicle.id] || [];

  // Transform vehicle equipment
  const equipment = vEquipment.map((eq: any) => {
    const equipmentInfo = eq.equipment || eq.custom_equipment;
    const profiles = getWeaponProfiles(eq, weaponProfilesData, customWeaponProfilesData);
    
    return {
      vehicle_weapon_id: eq.id,
      equipment_id: equipmentInfo?.id,
      custom_equipment_id: eq.custom_equipment_id,
      equipment_name: equipmentInfo?.equipment_name,
      equipment_type: equipmentInfo?.equipment_type,
      equipment_category: equipmentInfo?.equipment_category,
      cost: eq.purchase_cost,
      weapon_profiles: profiles.length > 0 ? profiles : null
    };
  });

  // Transform vehicle effects
  const effects = transformEffects(vEffects, modifiersByEffect);

  // Calculate costs
  const totalEquipmentCost = vEquipment.reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0);
  const totalEffectCredits = vEffects.reduce((sum: number, effect: any) => {
    const creditsIncrease = effect.type_specific_data?.credits_increase;
    return sum + (creditsIncrease ? parseInt(creditsIncrease) : 0);
  }, 0);

  // Use vehicle_types data if available, otherwise use vehicle data
  const vehicleTypeData = vehicle.vehicle_types || vehicle;

  return {
    id: vehicle.id,
    created_at: vehicle.created_at,
    vehicle_type_id: vehicle.vehicle_type_id,
    vehicle_type: vehicle.vehicle_type,
    cost: vehicle.cost,
    vehicle_name: vehicle.vehicle_name,
    movement: vehicleTypeData.movement,
    front: vehicleTypeData.front,
    side: vehicleTypeData.side,
    rear: vehicleTypeData.rear,
    hull_points: vehicleTypeData.hull_points,
    handling: vehicleTypeData.handling,
    save: vehicleTypeData.save,
    body_slots: vehicleTypeData.body_slots,
    drive_slots: vehicleTypeData.drive_slots,
    engine_slots: vehicleTypeData.engine_slots,
    body_slots_occupied: vehicle.body_slots_occupied,
    drive_slots_occupied: vehicle.drive_slots_occupied,
    engine_slots_occupied: vehicle.engine_slots_occupied,
    special_rules: vehicleTypeData.special_rules,
    equipment,
    total_equipment_cost: totalEquipmentCost,
    effects,
    total_effect_credits: totalEffectCredits
  };
}

/**
 * Cached version of get_gang_details using direct SQL queries
 * Uses existing cache tags that are already invalidated by equipment actions
 * 
 * Cache Tags Used:
 * - GANG_OVERVIEW: Gang basic info, stash, campaigns, vehicles
 * - GANG_CREDITS: Gang credits (invalidated by equipment purchases)  
 * - GANG_RATING: Gang rating calculated from fighters
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