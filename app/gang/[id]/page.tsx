import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import GangPageContent from "@/components/gang/gang-page-content";
import { FighterProps, FighterSkills } from "@/types/fighter";
import { Equipment } from "@/types/equipment";
import { PermissionService } from "@/app/lib/user-permissions";
import { getAuthenticatedUser } from "@/utils/auth";
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/lib/queries/keys';

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
      captured: fighter.captured || false,
      free_skill: fighter.free_skill || false,
      image_url: fighter.image_url,
      owner_name: fighter.owner_name, // Preserve owner name for exotic beasts
      beast_equipment_stashed: fighter.beast_equipment_stashed, // Preserve beast equipment stash status
      vehicle,
    };
  });

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
    gang_affiliation_id: gangData.gang_affiliation_id || null,
    gang_affiliation_name: gangData.gang_affiliation?.name || "",
    gang_type_has_affiliation: gangData.gang_types?.affiliation || false,
    fighters: processedFighters,
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

  // Get authenticated user via claims (no extra network call)
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect("/sign-in");
  }

  // Create a new QueryClient for this request (same pattern as fighter page)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes - longer stale time
        gcTime: 1000 * 60 * 10, // 10 minutes - garbage collection time
        refetchOnMount: false, // Don't refetch on mount if data exists
        refetchOnWindowFocus: false, // Don't refetch on window focus
        refetchOnReconnect: false, // Don't refetch on reconnect
      },
    },
  });

  try {
    // Fetch gang data using granular shared functions
    const {
      getGangBasic,
      getGangPositioning,
      getGangType,
      getAlliance,
      getGangFightersList,
      getGangVehicles,
      getGangStash,
      getGangCampaigns,
      getGangVariants,
      getGangRating,
      getGangCredits,
      getUserProfile
    } = await import('@/app/lib/gang-data');

    // Get supabase client first to pass to all functions
    const supabase = await createClient();

    // Fetch basic gang data first to check if gang exists
    const gangBasic = await getGangBasic(params.id, supabase);
    
    if (!gangBasic) {
      notFound();
    }

    // Fetch all related data in parallel using granular functions
    const [
      gangPositioning,
      gangType,
      alliance,
      fighters,
      vehicles,
      stash,
      campaigns,
      gangCredits,
      gangVariants,
      gangRating,
      userProfile
    ] = await Promise.all([
      getGangPositioning(params.id, supabase),
      getGangType(gangBasic.gang_type_id, supabase),
      getAlliance(gangBasic.alliance_id, supabase),
      getGangFightersList(params.id, supabase),
      getGangVehicles(params.id, supabase),
      getGangStash(params.id, supabase),
      getGangCampaigns(params.id, supabase),
      getGangCredits(params.id, supabase),
      getGangVariants(gangBasic.gang_variants || [], supabase),
      getGangRating(params.id, supabase),
      getUserProfile(gangBasic.user_id, supabase)
    ]);

    // Assemble the gang data structure
    const gangData = {
      id: gangBasic.id,
      name: gangBasic.name,
      gang_type: gangBasic.gang_type,
      gang_type_id: gangBasic.gang_type_id,
      gang_type_image_url: gangType.image_url,
      image_url: gangBasic.image_url,
      gang_colour: gangBasic.gang_colour,
      credits: gangCredits,
      reputation: gangBasic.reputation,
      meat: gangBasic.meat,
      scavenging_rolls: gangBasic.scavenging_rolls,
      exploration_points: gangBasic.exploration_points,
      rating: gangRating,
      alignment: gangBasic.alignment,
      positioning: gangPositioning,
      note: gangBasic.note,
      note_backstory: gangBasic.note_backstory,
      stash: stash,
      created_at: gangBasic.created_at,
      last_updated: gangBasic.last_updated,
      fighters: fighters,
      campaigns: campaigns,
      vehicles: vehicles,
      alliance_id: gangBasic.alliance_id,
      alliance_name: alliance?.alliance_name,
      alliance_type: alliance?.alliance_type,
      gang_variants: gangVariants,
      gang_affiliation_id: gangBasic.gang_affiliation_id,
      gang_affiliation: gangBasic.gang_affiliation,
      gang_types: gangBasic.gang_types,
      user_id: gangBasic.user_id,
      username: userProfile?.username
    };

    // 🎯 PREFETCH COMPLETE FIGHTER DATA - Same cache keys as fighter pages!
    const { 
      queryFighterBasic,
      queryFighterEquipment,
      queryFighterSkills,
      queryFighterEffects,
      queryFighterVehicles
    } = await import('@/app/lib/queries/fighter-queries');
    
    // Prefetch all fighter data in parallel for each fighter
    await Promise.all(
      fighters.map((fighter: any) => 
        Promise.all([
          // Basic fighter data
          queryClient.prefetchQuery({
            queryKey: queryKeys.fighters.detail(fighter.id),
            queryFn: () => queryFighterBasic(fighter.id, supabase),
          }),
          // Fighter equipment (weapons, wargear)
          queryClient.prefetchQuery({
            queryKey: queryKeys.fighters.equipment(fighter.id),
            queryFn: () => queryFighterEquipment(fighter.id, supabase),
          }),
          // Fighter skills
          queryClient.prefetchQuery({
            queryKey: queryKeys.fighters.skills(fighter.id),
            queryFn: () => queryFighterSkills(fighter.id, supabase),
          }),
          // Fighter effects (injuries, advancements, etc.)
          queryClient.prefetchQuery({
            queryKey: queryKeys.fighters.effects(fighter.id),
            queryFn: () => queryFighterEffects(fighter.id, supabase),
          }),
          // Fighter vehicles
          queryClient.prefetchQuery({
            queryKey: queryKeys.fighters.vehicles(fighter.id),
            queryFn: () => queryFighterVehicles(fighter.id, supabase),
          }),
        ])
      )
    );

    // Process the data server-side
    const processedData = await processGangData(gangData);
    
    // Get user permissions for this gang
    const permissionService = new PermissionService();
    const userPermissions = await permissionService.getGangPermissions(user.id, params.id);
    
    return (
      <HydrationBoundary state={dehydrate(queryClient)}>
        <GangPageContent
          initialGangData={processedData}
          gangId={params.id}
          userId={user.id}
          userPermissions={userPermissions}
        />
      </HydrationBoundary>
    );
  } catch (error) {
    console.error('Error in GangPage:', error);
    throw error;
  }
}