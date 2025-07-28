import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";
import { PermissionService } from "@/app/lib/user-permissions";
import { getGangFighters } from "@/app/lib/fighter-advancements";
import { getFighterTypesForModal } from "@/app/lib/get-fighter-types";

interface FighterPageProps {
  params: Promise<{ id: string }>;
}

export default async function FighterPageServer({ params }: FighterPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  try {
    // Fetch fighter data using granular shared functions
    const {
      getFighterBasic,
      getFighterEquipment,
      getFighterSkills,
      getFighterEffects,
      getFighterVehicles,
      getFighterTotalCost
    } = await import('@/app/lib/shared/fighter-data');

    const {
      getGangBasic,
      getGangPositioning
    } = await import('@/app/lib/shared/gang-data');

    // Fetch basic fighter data first to check if fighter exists
    const fighterBasic = await getFighterBasic(id, supabase);
    
    if (!fighterBasic) {
      redirect("/");
    }

    // Fetch gang basic data and positioning
    const [gangBasic, gangPositioning] = await Promise.all([
      getGangBasic(fighterBasic.gang_id, supabase),
      getGangPositioning(fighterBasic.gang_id, supabase)
    ]);

    // Fetch all fighter-related data in parallel using granular functions
    const [
      equipment,
      skills,
      effects,
      vehicles,
      totalCost
    ] = await Promise.all([
      getFighterEquipment(id, supabase),
      getFighterSkills(id, supabase),
      getFighterEffects(id, supabase),
      getFighterVehicles(id, supabase),
      getFighterTotalCost(id, supabase)
    ]);

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
        credits: gangBasic.credits,
        gang_type_id: gangBasic.gang_type_id,
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

    // Fetch fighter types including gang variants using cached function
    // Pass the supabase client to avoid creating a new one inside the cached function
    const fighterTypesData = await getFighterTypesForModal(
      fighterData.gang.id,
      fighterData.gang.gang_type_id,
      fighterData.gang.gang_variants || [],
      supabase
    );

    // Pass fighter data and user permissions to client component
    return (
      <FighterPageComponent
        initialFighterData={fighterData}
        initialGangFighters={gangFighters}
        userPermissions={userPermissions}
        fighterId={id}
        fighterTypesData={fighterTypesData}
      />
    );

  } catch (error) {
    console.error('Error in fighter page:', error);
    redirect("/");
  }
}
