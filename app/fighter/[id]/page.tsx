import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";
import { PermissionService } from "@/app/lib/user-permissions";
import { getGangFighters } from "@/app/lib/fighter-advancements";
import { getAuthenticatedUser } from "@/utils/auth";

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

  try {
    // Fetch fighter data using granular shared functions
    const {
      getFighterBasic,
      getFighterEquipment,
      getFighterSkills,
      getFighterEffects,
      getFighterVehicles,
      getFighterOwnedBeastsCost
    } = await import('@/app/lib/shared/fighter-data');

    const {
      getGangBasic,
      getGangPositioning,
      getGangCredits
    } = await import('@/app/lib/shared/gang-data');

    // Fetch basic fighter data first to check if fighter exists
    const fighterBasic = await getFighterBasic(id, supabase);

    if (!fighterBasic) {
      redirect("/");
    }

    // Fetch ALL data in parallel after we have fighterBasic
    const [
      gangBasic,
      gangPositioning,
      gangCredits,
      equipment,
      skills,
      effects,
      vehicles,
      beastCosts,
      fighterTypeData,
      fighterSubTypeData,
      campaignDataResult,
      beastDataResult,
      ownershipDataResult
    ] = await Promise.all([
      // Gang data
      getGangBasic(fighterBasic.gang_id, supabase),
      getGangPositioning(fighterBasic.gang_id, supabase),
      getGangCredits(fighterBasic.gang_id, supabase),
      // Fighter data
      getFighterEquipment(id, supabase),
      getFighterSkills(id, supabase),
      getFighterEffects(id, supabase),
      getFighterVehicles(id, supabase),
      getFighterOwnedBeastsCost(id, supabase),
      // Fighter type data
      fighterBasic.fighter_type_id ?
        supabase
          .from('fighter_types')
          .select('id, fighter_type, alliance_crew_name')
          .eq('id', fighterBasic.fighter_type_id)
          .single() :
        Promise.resolve({ data: null, error: null }),
      fighterBasic.fighter_sub_type_id ?
        supabase
          .from('fighter_sub_types')
          .select('id, sub_type_name')
          .eq('id', fighterBasic.fighter_sub_type_id)
          .single() :
        Promise.resolve({ data: null, error: null }),
      // Campaign data
      supabase
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
        .single(),
      // Beast ownership data
      supabase
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
        .eq('fighter_owner_id', id),
      // Owner check (if this fighter is a beast)
      fighterBasic.fighter_pet_id ?
        supabase
          .from('fighter_exotic_beasts')
          .select(`
            fighter_owner_id,
            fighters!fighter_owner_id (
              fighter_name
            )
          `)
          .eq('id', fighterBasic.fighter_pet_id)
          .single() :
        Promise.resolve({ data: null, error: null })
    ]);

    // Process campaign data
    const campaigns: any[] = [];
    if (!campaignDataResult.error && campaignDataResult.data) {
      const campaignGangs = (campaignDataResult.data.gang as any)?.campaign_gangs || [];
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

    // Process beast ownership data
    const ownedBeasts: any[] = [];
    if (!beastDataResult.error && beastDataResult.data) {
      const beastIds = beastDataResult.data.map(beast => beast.fighter_pet_id).filter(Boolean);

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
          beastDataResult.data.forEach((beastOwnership: any) => {
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

    // Process owner data
    const ownerName = ownershipDataResult.data
      ? (ownershipDataResult.data.fighters as any)?.fighter_name
      : undefined;

    // Calculate total cost inline (avoid redundant getFighterTotalCost call)
    let totalCost = 0;

    // Check if this fighter is owned by another fighter (exotic beast)
    const isOwnedBeast = !!ownershipDataResult.data;

    if (!isOwnedBeast) {
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

      totalCost = fighterBasic.credits + equipmentCost + skillsCost + effectsCost + vehicleCost +
                  (fighterBasic.cost_adjustment || 0) + beastCosts;
    }

    // Assemble the fighter data structure
    const fighterData = {
      fighter: {
        ...fighterBasic,
        credits: totalCost,
        alliance_crew_name: fighterTypeData?.data?.alliance_crew_name,
        fighter_type: {
          fighter_type_id: fighterTypeData?.data?.id || fighterBasic.custom_fighter_type_id || '',
          fighter_type: fighterBasic.fighter_type || fighterTypeData?.data?.fighter_type || 'Unknown',
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

    // Pass fighter data and user permissions to client component
    return (
      <FighterPageComponent
        initialFighterData={fighterData}
        initialGangFighters={gangFighters}
        userPermissions={userPermissions}
        fighterId={id}
      />
    );

  } catch (error) {
    console.error('Error in fighter page:', error);
    redirect("/");
  }
}
