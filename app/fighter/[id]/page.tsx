import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";
import { PermissionService } from "@/app/lib/user-permissions";
import { getGangFighters } from "@/app/lib/fighter-advancements";
import { getAuthenticatedUser } from "@/utils/auth";
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/lib/queries/keys';

interface FighterPageProps {
  params: Promise<{ id: string }>;
}

export default async function FighterPageServer({ params }: FighterPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get authenticated user via claims (no extra network call)
  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect("/sign-in");
  }

  // Create a new QueryClient for this request
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
    // Import fighter query functions for prefetching
    const { 
      queryFighterBasic,
      queryFighterEquipment,
      queryFighterSkills,
      queryFighterEffects,
      queryFighterVehicles
    } = await import('@/app/lib/queries/fighter-queries');

    // Prefetch fighter data in parallel using query functions with server-side Supabase client
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.fighters.detail(id),
        queryFn: () => queryFighterBasic(id, supabase),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.fighters.equipment(id),
        queryFn: () => queryFighterEquipment(id, supabase),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.fighters.skills(id),
        queryFn: () => queryFighterSkills(id, supabase),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.fighters.effects(id),
        queryFn: () => queryFighterEffects(id, supabase),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.fighters.vehicles(id),
        queryFn: () => queryFighterVehicles(id, supabase),
      }),
    ]);

    // Get basic fighter data to determine gang ID and check if fighter exists
    // Use the query function directly for server-side data fetching
    const fighterBasic = await queryFighterBasic(id, supabase);
    
    if (!fighterBasic) {
      redirect("/");
    }

    // Prefetch gang data using consistent cache keys and client-safe query functions
    const { queryGangBasic, queryGangCredits, queryGangPositioning } = await import('@/app/lib/queries/gang-queries');
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.gangs.detail(fighterBasic.gang_id),
        queryFn: () => queryGangBasic(fighterBasic.gang_id, supabase),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.gangs.credits(fighterBasic.gang_id),
        queryFn: () => queryGangCredits(fighterBasic.gang_id, supabase),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.gangs.positioning(fighterBasic.gang_id),
        queryFn: () => queryGangPositioning(fighterBasic.gang_id, supabase),
      }),
    ]);

    // Get gang data using query functions for consistency
    const [gangBasic, gangPositioning, gangCredits] = await Promise.all([
      queryGangBasic(fighterBasic.gang_id, supabase),
      queryGangPositioning(fighterBasic.gang_id, supabase),
      queryGangCredits(fighterBasic.gang_id, supabase)
    ]);



    const [
      equipment,
      skills,
      effects,
      vehicles
    ] = await Promise.all([
      queryFighterEquipment(id, supabase),
      queryFighterSkills(id, supabase),
      queryFighterEffects(id, supabase),
      queryFighterVehicles(id, supabase)
    ]);

    // Calculate total cost manually since we have all the data
    const baseCost = fighterBasic.credits || 0;
    const equipmentCost = equipment.reduce((sum: number, item: any) => sum + (item.purchase_cost || 0), 0);
    const skillsCost = Object.values(skills).reduce((sum: number, skill: any) => sum + (skill.credits_increase || 0), 0);
    const effectsCost = Object.values(effects).flat().reduce((sum: number, effect: any) => {
      return sum + ((effect.type_specific_data as any)?.credits_increase || 0);
    }, 0);
    const vehicleCost = vehicles.reduce((sum: number, vehicle: any) => sum + (vehicle.cost || 0), 0);
    const adjustment = fighterBasic.cost_adjustment || 0;
    
    const totalCost = baseCost + equipmentCost + skillsCost + effectsCost + vehicleCost + adjustment;

    // Get fighter type and sub-type info (these are fighter-specific queries)
    const [fighterTypeData, fighterSubTypeData] = await Promise.all([
      supabase
        .from('fighter_types')
        .select('id, fighter_type, alliance_crew_name')
        .eq('id', fighterBasic.fighter_type_id)
        .single(),
      fighterBasic.fighter_sub_type_id ? 
        supabase
          .from('fighter_sub_types')
          .select('id, sub_type_name')
          .eq('id', fighterBasic.fighter_sub_type_id)
          .single() : 
        Promise.resolve({ data: null, error: null })
    ]);

    // Get fighter campaigns (fighter-specific)
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
      .eq('id', id)
      .single();

    const campaigns: any[] = [];
    if (!campaignError && campaignData) {
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

    // Get fighter's owned exotic beasts (fighter-specific)
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
      .eq('fighter_owner_id', id);

    const ownedBeasts: any[] = [];
    if (!beastError && beastData) {
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

        if (!beastFighterError && beastFighters) {
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

    // Check if this fighter is owned by another fighter
    let ownerName: string | undefined;
    if (fighterBasic.fighter_pet_id) {
      const { data: ownershipData } = await supabase
        .from('fighter_exotic_beasts')
        .select(`
          fighter_owner_id,
          fighters!fighter_owner_id (
            fighter_name
          )
        `)
        .eq('id', fighterBasic.fighter_pet_id)
        .single();
      
      if (ownershipData) {
        ownerName = (ownershipData.fighters as any)?.fighter_name;
      }
    }

    // Assemble the fighter data structure
    const fighterData = {
      fighter: {
        ...fighterBasic,
        credits: totalCost,
        alliance_crew_name: fighterTypeData?.data?.alliance_crew_name,
        fighter_type: {
          id: fighterTypeData?.data?.id || '',
          fighter_type: fighterTypeData?.data?.fighter_type || 'Unknown',
          alliance_crew_name: fighterTypeData?.data?.alliance_crew_name
        },
        fighter_sub_type: fighterSubTypeData?.data ? {
          id: fighterSubTypeData.data.id,
          sub_type_name: fighterSubTypeData.data.sub_type_name,
          fighter_sub_type: fighterSubTypeData.data.sub_type_name
        } : undefined,
        skills,
        effects,
        vehicles,
        campaigns,
        owned_beasts: ownedBeasts,
        owner_name: ownerName,
      },
      gang: {
        id: gangBasic.id,
        credits: gangCredits,
        gang_type_id: gangBasic.gang_type_id,
        gang_affiliation_id: gangBasic.gang_affiliation_id,
        gang_affiliation_name: gangBasic.gang_affiliation?.name,
        positioning: gangPositioning,
        gang_variants: [] as any[] // Will be populated below if needed
      },
      equipment,
    };

    // Get gang variants if they exist
    if (gangBasic.gang_variants && gangBasic.gang_variants.length > 0) {
      const { data: variants } = await supabase
        .from('gang_variant_types')
        .select('id, variant')
        .in('id', gangBasic.gang_variants);
      
      if (variants) {
        fighterData.gang.gang_variants = variants.map((v: any) => ({
          id: v.id,
          variant: v.variant
        }));
      }
    }


    // Use centralized permission service to get user permissions
    const permissionService = new PermissionService();
    const userPermissions = await permissionService.getFighterPermissions(user.id, id);

    // Fetch gang fighters for the dropdown using cached function
    const gangFighters = await getGangFighters(fighterData.gang.id, supabase);

    // Pass fighter data and user permissions to client component with hydration
    return (
      <HydrationBoundary state={dehydrate(queryClient)}>
        <FighterPageComponent
          initialFighterData={fighterData}
          initialGangFighters={gangFighters}
          userPermissions={userPermissions}
          fighterId={id}
        />
      </HydrationBoundary>
    );

  } catch (error) {
    redirect("/");
  }
}
