import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
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
      getFighterOwnedBeastsCost,
      getFighterTypeInfo,
      getFighterSubTypeInfo,
      getFighterCampaignData,
      getFighterOwnedBeastsData,
      getFighterOwnershipInfo
    } = await import('@/app/lib/shared/fighter-data');

    const {
      getGangBasic,
      getGangPositioning,
      getGangCredits
    } = await import('@/app/lib/shared/gang-data');

    // Fetch basic fighter data first to check if fighter exists
    const fighterBasic = await getFighterBasic(id, supabase);

    if (!fighterBasic) {
      notFound();
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
      // Fighter type data (using cached helpers)
      getFighterTypeInfo(fighterBasic.fighter_type_id, supabase),
      fighterBasic.fighter_sub_type_id ?
        getFighterSubTypeInfo(fighterBasic.fighter_sub_type_id, supabase) :
        Promise.resolve(null),
      // Campaign data (using cached helper)
      getFighterCampaignData(id, supabase),
      // Beast ownership data (using cached helper)
      getFighterOwnedBeastsData(id, supabase),
      // Owner check (if this fighter is a beast, using cached helper)
      fighterBasic.fighter_pet_id ?
        getFighterOwnershipInfo(fighterBasic.fighter_pet_id, supabase) :
        Promise.resolve(null)
    ]);

    // Check if gang exists (shouldn't happen but handle gracefully)
    if (!gangBasic) {
      notFound();
    }

    // Check user permissions BEFORE fetching additional data
    const permissionService = new PermissionService();
    const userPermissions = await permissionService.getFighterPermissions(user.id, id);

    // TODO: Add authorization check here if needed
    // if (!userPermissions.canView) {
    //   redirect("/unauthorized");
    // }

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
            invited_by: cg.invited_by,
            has_meat: cg.campaign.has_meat,
            has_exploration_points: cg.campaign.has_exploration_points,
            has_scavenging_rolls: cg.campaign.has_scavenging_rolls,
            trading_posts: cg.campaign.trading_posts || [],
          });
        }
      });
    }

    // Extract data needed for parallel batch queries
    const allTradingPostIds = campaigns
      .map((c: any) => c.trading_posts)
      .filter((tp: any) => tp && Array.isArray(tp) && tp.length > 0)
      .flat();
    const uniqueTradingPostIds = allTradingPostIds.length > 0 ? Array.from(new Set(allTradingPostIds)) : [];
    
    const beastIds = !beastDataResult.error && beastDataResult.data
      ? beastDataResult.data.map((beast: any) => beast.fighter_pet_id).filter(Boolean)
      : [];

    // Parallel batch: trading posts, beast fighters, gang variants, gang fighters
    const [
      tradingPostTypesResult,
      beastFightersResult,
      gangVariantsResult,
      gangFighters
    ] = await Promise.all([
      // Trading post names (only if needed)
      uniqueTradingPostIds.length > 0
        ? supabase
            .from('trading_post_types')
            .select('id, trading_post_name')
            .in('id', uniqueTradingPostIds)
        : Promise.resolve({ data: [] }),
      // Beast fighters (only if needed)
      beastIds.length > 0
        ? supabase
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
            .in('id', beastIds)
        : Promise.resolve({ data: [] }),
      // Gang variants (only if needed)
      gangBasic.gang_variants && gangBasic.gang_variants.length > 0
        ? supabase
            .from('gang_variant_types')
            .select('id, variant')
            .in('id', gangBasic.gang_variants)
        : Promise.resolve({ data: [] }),
      // Gang fighters
      getGangFighters(fighterBasic.gang_id, supabase)
    ]);

    // Process trading post names
    let tradingPostNamesMap: Record<string, string> = {};
    if (tradingPostTypesResult.data && tradingPostTypesResult.data.length > 0) {
      tradingPostNamesMap = tradingPostTypesResult.data.reduce((acc: Record<string, string>, tp: any) => {
        acc[tp.id] = tp.trading_post_name;
        return acc;
      }, {});
    }

    // Add trading post names to campaigns
    campaigns.forEach((campaign: any) => {
      if (campaign.trading_posts && Array.isArray(campaign.trading_posts) && campaign.trading_posts.length > 0) {
        campaign.trading_post_names = campaign.trading_posts
          .map((id: string) => tradingPostNamesMap[id])
          .filter(Boolean);
      } else {
        campaign.trading_post_names = [];
      }
    });

    // Process beast ownership data
    const ownedBeasts: any[] = [];
    if (beastFightersResult.data && beastFightersResult.data.length > 0 && !beastDataResult.error && beastDataResult.data) {
      beastDataResult.data.forEach((beastOwnership: any) => {
        const beast = beastFightersResult.data.find((f: any) => f.id === beastOwnership.fighter_pet_id) as any;
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

    // Process owner data
    const ownerName = ownershipDataResult?.owner_name;

    // Calculate total cost inline (avoid redundant getFighterTotalCost call)
    let totalCost = 0;

    // Check if this fighter is owned by another fighter (exotic beast)
    const isOwnedBeast = !!ownershipDataResult;

    if (!isOwnedBeast) {
      // Calculate total cost for normal fighters
      const equipmentCost = equipment.reduce((sum, eq) => sum + eq.purchase_cost, 0);
      const skillsCost = Object.values(skills).reduce((sum, skill) => sum + skill.credits_increase, 0);
      const effectsCost = Object.values(effects).flat().reduce((sum, effect) => {
        const data = effect.type_specific_data;
        return sum + (typeof data === 'object' && data?.credits_increase ? data.credits_increase : 0);
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
        alliance_crew_name: fighterTypeData?.alliance_crew_name,
        is_spyrer: fighterTypeData?.is_spyrer || false,
        fighter_type: {
          fighter_type_id: fighterTypeData?.id || fighterBasic.custom_fighter_type_id || '',
          fighter_type: fighterBasic.fighter_type || fighterTypeData?.fighter_type || 'Unknown',
          alliance_crew_name: fighterTypeData?.alliance_crew_name
        },
        fighter_sub_type: fighterSubTypeData ? {
          id: fighterSubTypeData.fighter_sub_type_id,
          sub_type_name: fighterSubTypeData.fighter_sub_type,
          fighter_sub_type: fighterSubTypeData.fighter_sub_type
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

    // Process gang variants
    if (gangVariantsResult.data && gangVariantsResult.data.length > 0) {
      fighterData.gang.gang_variants = gangVariantsResult.data.map((v: any) => ({
        id: v.id,
        variant: v.variant
      }));
    }

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
    console.error('Error in FighterPage:', error);
    throw error;
  }
}
