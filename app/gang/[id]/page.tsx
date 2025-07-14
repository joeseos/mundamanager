import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import GangPageContent from "@/components/gang/gang-page-content";
import { FighterProps, FighterSkills } from "@/types/fighter";
import { FighterType } from "@/types/fighter-type";
import { Equipment } from "@/types/equipment";

// Move processGangData function here (server-side processing)
async function processGangData(gangData: any) {
  const processedFighters = gangData.fighters.map((fighter: any) => {
    // Filter out null equipment entries and process equipment
    const validEquipment = (fighter.equipment?.filter((item: Equipment | null) => item !== null) || []) as Equipment[];
    
    // Only process vehicle data for crew fighters
    const vehicle = fighter.fighter_class === 'Crew' && fighter.vehicles?.[0] ? {
      ...fighter.vehicles[0],
      equipment: fighter.vehicles[0].equipment || []
    } : undefined;

    // Ensure skills is processed correctly
    const processedSkills: FighterSkills = {};
    
    if (fighter.skills) {
      // If skills is an object with string keys (new format)
      if (typeof fighter.skills === 'object' && !Array.isArray(fighter.skills)) {
        Object.assign(processedSkills, fighter.skills);
      } 
      // If skills is an array (old format), convert to object
      else if (Array.isArray(fighter.skills)) {
        fighter.skills.forEach((skill: any) => {
          if (skill.name) {
            processedSkills[skill.name] = {
              id: skill.id,
              credits_increase: skill.credits_increase,
              xp_cost: skill.xp_cost,
              is_advance: skill.is_advance,
              acquired_at: skill.acquired_at,
              fighter_injury_id: skill.fighter_injury_id
            };
          }
        });
      }
    }

    return {
      id: fighter.id,
      fighter_name: fighter.fighter_name,
      fighter_type_id: fighter.fighter_type_id,
      fighter_type: fighter.fighter_type,
      fighter_class: fighter.fighter_class,
      fighter_sub_type: fighter.fighter_sub_type,
      alliance_crew_name: fighter.alliance_crew_name,
      label: fighter.label,
      credits: fighter.credits,
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
      xp: fighter.xp ?? 0,
      advancements: {
        characteristics: fighter.advancements?.characteristics || {},
        skills: fighter.advancements?.skills || {}
      },
      base_stats: {
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
        intelligence: fighter.intelligence
      },
      current_stats: {
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
        intelligence: fighter.intelligence
      },
      skills: processedSkills,
      effects: fighter.effects || { 
        injuries: [], 
        advancements: [], 
        bionics: [], 
        cyberteknika: [], 
        'gene-smithing': [], 
        'rig-glitches': [], 
        augmentations: [], 
        equipment: [], 
        user: [] 
      },
      weapons: validEquipment
        .filter((item: Equipment) => item.equipment_type === 'weapon')
        .map((item: Equipment) => ({
          weapon_name: item.equipment_name,
          weapon_id: item.equipment_id,
          cost: item.cost,
          fighter_weapon_id: item.fighter_weapon_id || item.fighter_equipment_id,
          weapon_profiles: item.weapon_profiles || []
        })) || [],
      wargear: validEquipment
        .filter((item: Equipment) => item.equipment_type === 'wargear')
        .map((item: Equipment) => ({
          wargear_name: item.equipment_name,
          wargear_id: item.equipment_id,
          cost: item.cost,
          fighter_weapon_id: item.fighter_weapon_id
        })) || [],
      vehicles: fighter.vehicles || [],
      special_rules: fighter.special_rules || [],
      note: fighter.note,
      killed: fighter.killed || false,
      retired: fighter.retired || false,
      enslaved: fighter.enslaved || false,
      starved: fighter.starved || false,
      recovery: fighter.recovery || false,
      free_skill: fighter.free_skill || false,
      vehicle,
    };
  });

  // Fetch fighter types on the server-side to enable caching
  let processedFighterTypes: FighterType[] = [];
  try {
    const { getFighterTypes } = await import('@/app/lib/get-fighter-types');
    const fighterTypes = await getFighterTypes(gangData.gang_type_id);
    
    // Transform server response to match UI expectations
    processedFighterTypes = fighterTypes.map((type: any) => ({
      id: type.id,
      fighter_type_id: type.id,
      fighter_type: type.fighter_type,
      fighter_class: type.fighter_class,
      gang_type: type.gang_type,
      gang_type_id: type.gang_type_id,
      movement: type.movement,
      weapon_skill: type.weapon_skill,
      ballistic_skill: type.ballistic_skill,
      strength: type.strength,
      toughness: type.toughness,
      wounds: type.wounds,
      initiative: type.initiative,
      leadership: type.leadership,
      cool: type.cool,
      willpower: type.willpower,
      intelligence: type.intelligence,
      attacks: type.attacks,
      limitation: type.limitation,
      alignment: type.alignment,
      sub_type: type.sub_type,
      fighter_sub_type_id: type.sub_type?.id || type.fighter_sub_type_id,
      cost: type.cost,
      total_cost: type.total_cost,
      equipment_selection: type.equipment_selection,
      default_equipment: type.default_equipment || [],
      special_rules: type.special_rules || [],
      is_gang_addition: type.is_gang_addition || false,
      alliance_id: type.alliance_id || '',
      alliance_crew_name: type.alliance_crew_name || ''
    }));
  } catch (error) {
    console.error('Error fetching fighter types:', error);
    // Continue with empty array if fetch fails
  }
  
  // init or fix positioning for all fighters
  let positioning = gangData.positioning || {};

  // If no positions exist, create initial positions sorted by fighter name
  if (Object.keys(positioning).length === 0) {
    const sortedFighters = [...processedFighters].sort((a, b) => 
      a.fighter_name.localeCompare(b.fighter_name)
    );
    
    positioning = sortedFighters.reduce((acc, fighter, index) => ({
      ...acc,
      [index]: fighter.id
    }), {});
  } else {
    // First, filter out any positions referencing non-existent fighters
    const validFighterIds = new Set(processedFighters.map((f: FighterProps) => f.id));
    const validPositions: Record<string, string> = {};
    
    Object.entries(positioning as Record<string, string>).forEach(([pos, fighterId]) => {
      if (validFighterIds.has(fighterId)) {
        validPositions[pos] = fighterId;
      }
    });

    // Handle existing positions - fix any gaps
    const currentPositions = Object.keys(validPositions).map(pos => Number(pos)).sort((a, b) => a - b);
    let expectedPosition = 0;
    const positionMapping: Record<number, number> = {};

    currentPositions.forEach(position => {
      positionMapping[position] = expectedPosition;
      expectedPosition++;
    });

    // Create new positioning object with corrected positions
    const newPositioning: Record<number, string> = {};
    for (const [pos, fighterId] of Object.entries(validPositions)) {
      newPositioning[positionMapping[Number(pos)] ?? expectedPosition++] = fighterId;
    }
    positioning = newPositioning;

    // make sure each fighter has a position
    processedFighters.forEach((fighter: FighterProps) => {
      if (!Object.values(positioning).includes(fighter.id)) {
        positioning[expectedPosition++] = fighter.id;
      }
    });
  }

  // Check if positions have changed from what's in the database
  const positionsHaveChanged = !gangData.positioning || 
    Object.entries(positioning).some(
      ([id, pos]) => gangData.positioning[id] !== pos
    );

  // Update database if positions have changed
  if (positionsHaveChanged) {
    const supabase = await createClient();
    const { error } = await supabase
      .from('gangs')
      .update({ positioning })
      .eq('id', gangData.id);

    if (error) {
      console.error('Error updating positions:', error);
    }
  }

  const processedData = {
    ...gangData,
    alignment: gangData.alignment,
    alliance_name: gangData.alliance_name || "",
    fighters: processedFighters,
    fighterTypes: processedFighterTypes,
    campaigns: gangData.campaigns?.map((campaign: any) => ({
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      role: campaign.role,
      status: campaign.status,
      has_meat: campaign.has_meat ?? false,
      has_exploration_points: campaign.has_exploration_points ?? false,
      has_scavenging_rolls: campaign.has_scavenging_rolls ?? false,
      territories: campaign.territories || []
    })),
    stash: (gangData.stash || []).map((item: any) => ({
      id: item.id,
      equipment_name: item.equipment_name,
      vehicle_name: item.vehicle_name,
      cost: item.cost,
      type: item.type || 'equipment',
      equipment_type: item.equipment_type,
      equipment_category: item.equipment_category,
      vehicle_id: item.vehicle_id,
      equipment_id: item.equipment_id,
      custom_equipment_id: item.custom_equipment_id
    })),
    vehicles: gangData.vehicles || [],
    positioning,
    gang_variants: gangData.gang_variants?.map((variant: any) => {
      // Handle different possible data structures
      if (variant.gang_variant_types) {
        return {
          id: variant.gang_variant_types.id,
          variant: variant.gang_variant_types.variant
        };
      } else if (variant.id && variant.variant) {
        return {
          id: variant.id,
          variant: variant.variant
        };
      } else {
        return {
          id: variant,
          variant: variant
        };
      }
    }) || []
  };

  processedData.user_id = gangData.user_id;
  return processedData;
}

export default async function GangPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  try {
    // Fetch gang data using cached server function
    const { getGangDetails } = await import('@/app/lib/gang-details');
    const result = await getGangDetails(params.id);

    if (!result.success) {
      console.error('Error fetching gang details:', result.error);
      throw new Error(result.error || 'Failed to fetch gang details');
    }

    const gangData = result.data;
    
    if (!gangData) {
      notFound();
    }

    // Process the data server-side
    const processedData = await processGangData(gangData);
    
    return (
      <GangPageContent
        initialGangData={processedData}
        gangId={params.id}
        userId={user.id}
      />
    );
  } catch (error) {
    console.error('Error in GangPage:', error);
    throw error;
  }
}