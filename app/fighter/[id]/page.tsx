import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";
import { checkPermissionCached } from "@/utils/user-permissions";
import { getGangFighters } from "@/app/lib/fighter-advancements";
import { getAuthenticatedUser, signInPath } from "@/utils/auth";

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
    redirect(signInPath(`/fighter/${id}`));
  }

  let pageProps;
  try {
    const { getFighterBasic } = await import('@/app/lib/shared/fighter-data');
    const {
      getGangCore,
      getGangPositioning,
      getGangCampaigns,
      getGangFightersBundle,
      getGangVariants
    } = await import('@/app/lib/shared/gang-data');
    const { assembleFighterView } = await import('@/app/lib/shared/gang-assembly');

    // Fetch basic fighter data first to check if fighter exists and resolve the gang
    const fighterBasic = await getFighterBasic(id, supabase);

    if (!fighterBasic) {
      notFound();
    }

    // The fighter's data comes from the SAME cache entries the gang page uses
    // (core + fighters bundle + campaigns bundle) — usually warm after any
    // gang page visit.
    const [gangBasic, gangPositioning, bundle, gangCampaigns, gangFighters] = await Promise.all([
      getGangCore(fighterBasic.gang_id, supabase),
      getGangPositioning(fighterBasic.gang_id, supabase),
      getGangFightersBundle(fighterBasic.gang_id, supabase),
      getGangCampaigns(fighterBasic.gang_id, supabase),
      getGangFighters(fighterBasic.gang_id, supabase)
    ]);

    // Check if gang exists (shouldn't happen but handle gracefully)
    if (!gangBasic) {
      notFound();
    }

    const [userPermissions, gangVariantsResolved] = await Promise.all([
      checkPermissionCached(user.id, fighterBasic.gang_id, gangBasic.user_id),
      getGangVariants(gangBasic.gang_variants || [], supabase)
    ]);

    // Permissions: All authenticated users can view fighters (canView is always true)
    // Edit/delete permissions are enforced in FighterPageComponent

    const {
      equipment,
      skills,
      effects,
      vehicles,
      beastCosts,
      ownedBeastsData,
      beastFighters,
      ownershipInfo,
      loadouts,
      capturedByGangName,
      fighterTypeData,
      fighterSubTypeData
    } = assembleFighterView(bundle, id);

    // Campaign data already processed and includes trading post names (from getGangCampaigns)
    const campaigns = gangCampaigns;

    // Process beast ownership data
    const ownedBeasts: any[] = [];
    if (beastFighters.length) {
      ownedBeastsData.forEach((beastOwnership: any) => {
        const beast = beastFighters.find((f: any) => f.id === beastOwnership.fighter_pet_id) as any;
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
    const ownerName = ownershipInfo?.owner_name;

    // Calculate total cost inline (derived from the shared bundle)
    let totalCost = 0;

    // Check if this fighter is owned by another fighter (exotic beast)
    const isOwnedBeast = !!ownershipInfo;

    if (!isOwnedBeast) {
      // Calculate total cost for normal fighters
      const equipmentCost = equipment.reduce((sum: number, eq: any) => sum + eq.purchase_cost, 0);
      const skillsCost = Object.values(skills).reduce((sum: number, skill: any) => sum + skill.credits_increase, 0);
      const effectsCost = Object.values(effects).flat().reduce((sum: number, effect: any) => {
        const data = effect.type_specific_data;
        return sum + (typeof data === 'object' && data?.credits_increase ? data.credits_increase : 0);
      }, 0);

      // Calculate vehicle costs (base vehicle cost + vehicle equipment + vehicle effects)
      const vehicleCost = vehicles.reduce((sum: number, vehicle: any) => {
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
                  (fighterBasic.cost_adjustment || 0) + beastCosts.total;
    }

    // Enrich exotic beast equipment with beast's purchased equipment costs and advancements costs
    equipment.forEach((eq: any) => {
      if (eq.equipment_category?.toLowerCase() === 'status items: exotic beasts') {
        const breakdown = beastCosts.byEquipmentId[eq.fighter_equipment_id];
        if (breakdown) {
          eq.beast_equipment_cost = breakdown.equipment;
          eq.beast_advancements_cost = breakdown.advancements;
        }
      }
    });

    // Compute refund credits for deletion: owner base cost + all owner equipment purchase_cost
    // + each owned beast's own equipment purchase_cost (beast base is already in the owner's
    // beast-granting equipment purchase_cost). Exotic Beast Advancements are excluded.
    // Mirrors the server-side refund calculation in edit-fighter.ts case 'delete'.
    const refundCredits = isOwnedBeast
      ? 0
      : (fighterBasic.credits || 0)
          + equipment.reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0)
          + Object.values(beastCosts.byEquipmentId).reduce(
              (sum: number, b: { equipment: number; advancements: number }) => sum + b.equipment,
              0
            );

    // Filter effects by active loadout (for stats/display)
    // Total cost above uses ALL effects (correct for gang rating)
    if (fighterBasic.active_loadout_id) {
      const activeLoadout = loadouts.find((l: any) => l.id === fighterBasic.active_loadout_id);
      if (activeLoadout) {
        const loadoutEquipmentIds = new Set(activeLoadout.equipment_ids);
        Object.keys(effects).forEach(category => {
          effects[category] = effects[category].filter((effect: any) => {
            // Always show effects without equipment parent (injuries, advancements, etc.)
            if (!effect.fighter_equipment_id) {
              return true;
            }
            // Only show effects whose parent equipment is in active loadout
            return loadoutEquipmentIds.has(effect.fighter_equipment_id);
          });
        });
      }
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
          alliance_crew_name: fighterTypeData?.alliance_crew_name,
          // Prefer the fighter type's own gang association; fall back to the owning gang's type
          // so the promotion dropdown is never silently empty (e.g. when a custom gang type was deleted).
          gang_type_id: fighterTypeData?.gang_type_id
            || fighterBasic.custom_fighter_type?.gang_type_id
            || gangBasic.gang_type_id
            || null,
          custom_gang_type_id: fighterBasic.custom_fighter_type?.custom_gang_type_id
            || gangBasic.custom_gang_type_id
            || null,
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
        captured_by_gang_name: capturedByGangName ?? undefined,
        refund_credits: refundCredits,
      },
      gang: {
        id: gangBasic.id,
        credits: gangBasic.credits,
        reputation: gangBasic.reputation,
        gang_type_id: gangBasic.gang_type_id,
        custom_gang_type_id: gangBasic.custom_gang_type_id,
        gang_affiliation_id: gangBasic.gang_affiliation_id,
        gang_affiliation_name: gangBasic.gang_affiliation?.name,
        positioning: gangPositioning,
        gang_variants: gangVariantsResolved.map((v: any) => ({
          id: v.id,
          variant: v.variant
        }))
      },
      equipment,
      loadouts,
    };

    pageProps = { fighterData, gangFighters, userPermissions };
  } catch (error) {
    console.error('Error in FighterPage:', error);
    throw error;
  }

  return (
    <FighterPageComponent
      initialFighterData={pageProps.fighterData}
      initialGangFighters={pageProps.gangFighters}
      userPermissions={pageProps.userPermissions}
      fighterId={id}
    />
  );
}
