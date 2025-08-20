import { createClient } from '@/utils/supabase/client';

export const fightersApi = {
  getBasic: async (fighterId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('fighters')
      .select('*')
      .eq('id', fighterId)
      .single();
    
    if (error) throw error;
    return data;
  },
  
  getEquipment: async (fighterId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        equipment_id,
        custom_equipment_id,
        purchase_cost,
        original_cost,
        is_master_crafted,
        equipment!equipment_id (
          equipment_name,
          equipment_type,
          equipment_category
        ),
        custom_equipment!custom_equipment_id (
          equipment_name,
          equipment_type,
          equipment_category
        )
      `)
      .eq('fighter_id', fighterId)
      .is('vehicle_id', null);

    if (error) throw error;

    // Process equipment data to match expected format
    const processedEquipment = (data || []).map((item: any) => ({
      fighter_equipment_id: item.id,
      equipment_id: item.equipment_id || undefined,
      custom_equipment_id: item.custom_equipment_id || undefined,
      equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
      equipment_type: (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type || 'unknown',
      equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
      cost: Number(item.purchase_cost) || 0, // Deprecated: for backward compatibility
      purchase_cost: Number(item.purchase_cost) || 0,
      original_cost: item.original_cost,
      is_master_crafted: item.is_master_crafted || false,
      weapon_profiles: [] // Will be populated separately if needed
    }));

    return processedEquipment;
  },
  
  getSkills: async (fighterId: string) => {
    const supabase = createClient();
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
    
    // Transform to object format
    const skills: Record<string, any> = {};
    data?.forEach((skill: any) => {
      const skillName = (skill.skill as any)?.name || 
                       (skill.fighter_effect_skills as any)?.fighter_effects?.effect_name || 
                       'Unknown Skill';
      
      if (skillName && skillName !== 'Unknown Skill') {
        skills[skillName] = {
          id: skill.id,
          credits_increase: skill.credits_increase,
          xp_cost: skill.xp_cost,
          is_advance: skill.is_advance,
          acquired_at: skill.created_at,
          fighter_injury_id: skill.fighter_effect_skill_id
        };
      }
    });
    
    return skills;
  },
  
  getEffects: async (fighterId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('fighter_effects')
      .select('*')
      .eq('fighter_id', fighterId);
    
    if (error) throw error;
    return data || [];
  },
  
  getVehicles: async (fighterId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('fighter_id', fighterId);
    
    if (error) throw error;
    return data || [];
  },
  
  getTotalCost: async (fighterId: string) => {
    const supabase = createClient();
    // Simple fallback - just return the fighter's base credits for now
    const { data, error } = await supabase
      .from('fighters')
      .select('credits')
      .eq('id', fighterId)
      .single();
    
    if (error) throw error;
    return data?.credits || 0;
  },
  
  // Additional fighter-specific data
  getFighterType: async (fighterTypeId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('fighter_types')
      .select('id, fighter_type, alliance_crew_name')
      .eq('id', fighterTypeId)
      .single();
    
    if (error) throw error;
    return data;
  },
  
  getFighterSubType: async (fighterSubTypeId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('fighter_sub_types')
      .select('id, sub_type_name')
      .eq('id', fighterSubTypeId)
      .single();
    
    if (error) throw error;
    return data;
  },
  
  getCampaigns: async (fighterId: string) => {
    const supabase = createClient();
    const { data: campaignData, error: campaignError } = await supabase
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

    if (campaignError) throw campaignError;
    
    const campaigns: any[] = [];
    if (campaignData) {
      const campaignGangs = (campaignData.gang as any)?.campaign_gangs || [];
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
    }
    
    return campaigns;
  },
  
  getOwnedBeasts: async (fighterId: string) => {
    const supabase = createClient();
    const { data: beastData, error: beastError } = await supabase
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

    if (beastError) throw beastError;
    
    const ownedBeasts: any[] = [];
    if (beastData) {
      const beastIds = beastData.map(beast => beast.fighter_pet_id).filter(Boolean);
      
      if (beastIds.length > 0) {
        const { data: beastFighters, error: beastFighterError } = await supabase
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

        if (beastFighterError) throw beastFighterError;
        
        if (beastFighters) {
          beastData.forEach((beastOwnership: any) => {
            const beast = beastFighters.find(f => f.id === beastOwnership.fighter_pet_id);
            const equipment = beastOwnership.fighter_equipment?.equipment || beastOwnership.fighter_equipment?.custom_equipment;
            
            if (beast) {
              ownedBeasts.push({
                id: beast.id,
                fighter_name: beast.fighter_name,
                fighter_type: beast.fighter_type,
                fighter_class: beast.fighter_class,
                credits: beast.credits,
                equipment_source: 'Granted by equipment',
                equipment_name: equipment?.equipment_name || 'Unknown Equipment',
                created_at: beast.created_at,
                retired: beast.retired || false
              });
            }
          });
        }
      }
    }
    
    return ownedBeasts;
  },
  
  getOwnerName: async (fighterPetId: string) => {
    const supabase = createClient();
    const { data: ownershipData, error } = await supabase
      .from('fighter_exotic_beasts')
      .select(`
        fighter_owner_id,
        fighters!fighter_owner_id (
          fighter_name
        )
      `)
      .eq('id', fighterPetId)
      .single();
    
    if (error) throw error;
    return (ownershipData?.fighters as any)?.fighter_name;
  },
};