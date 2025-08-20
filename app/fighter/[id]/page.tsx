import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FighterPageComponent from "@/components/fighter/fighter-page";
import { PermissionService } from "@/app/lib/user-permissions";
import { getAuthenticatedUser } from "@/utils/auth";
import { 
  getFighterBasic, 
  getFighterEquipment, 
  getFighterSkills,
  getFighterEffects,
  getFighterVehicles,
  getFighterTotalCost 
} from "@/app/lib/shared/fighter-data";
import { 
  getGangBasic, 
  getGangCredits, 
  getGangPositioning, 
  getGangFightersList 
} from "@/app/lib/shared/gang-data";
import { InitialFighterData } from "@/lib/types/initial-data";

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

  // Check if fighter exists (minimal server-side check)
  const { data: fighterExists } = await supabase
    .from('fighters')
    .select('id, gang_id')
    .eq('id', id)
    .single();

  if (!fighterExists) {
    redirect("/");
  }

  // Get permissions
  const permissionService = new PermissionService();
  const userPermissions = await permissionService.getFighterPermissions(user.id, id);

  if (!userPermissions?.canView) {
    redirect("/");
  }

  // Fetch all initial data in parallel for fast SSR
  try {
    const [
      fighter,
      gang,
      equipment,
      skills,
      effects,
      vehicles,
      totalCost,
      gangCredits,
      gangPositioning,
      gangFighters
    ] = await Promise.all([
      getFighterBasic(id, supabase),
      getGangBasic(fighterExists.gang_id, supabase),
      getFighterEquipment(id, supabase),
      getFighterSkills(id, supabase),
      getFighterEffects(id, supabase),
      getFighterVehicles(id, supabase),
      getFighterTotalCost(id, supabase),
      getGangCredits(fighterExists.gang_id, supabase),
      getGangPositioning(fighterExists.gang_id, supabase),
      getGangFightersList(fighterExists.gang_id, supabase)
    ]);

    // Get fighter type and sub-type data in parallel
    const [fighterTypeData, fighterSubTypeData] = await Promise.all([
      supabase
        .from('fighter_types')
        .select('id, fighter_type, alliance_crew_name')
        .eq('id', fighter.fighter_type_id)
        .single(),
      fighter.fighter_sub_type_id ? 
        supabase
          .from('fighter_sub_types')
          .select('id, sub_type_name')
          .eq('id', fighter.fighter_sub_type_id)
          .single() : 
        Promise.resolve({ data: null, error: null })
    ]);

    // Get campaigns and owned beasts
    const [campaignData, ownedBeastsData] = await Promise.all([
      supabase
        .from('campaign_gangs')
        .select(`
          campaign:campaign_id (
            id,
            campaign_name
          )
        `)
        .eq('gang_id', fighterExists.gang_id),
      supabase
        .from('fighter_exotic_beasts')
        .select(`
          id,
          fighter_pet:fighter_pet_id (
            id,
            fighter_name,
            fighter_type,
            fighter_class
          )
        `)
        .eq('fighter_owner_id', id)
    ]);

    // Get owner name if this fighter is a pet
    let ownerName: string | undefined;
    if (fighter.fighter_pet_id) {
      const { data: ownershipData } = await supabase
        .from('fighter_exotic_beasts')
        .select(`
          fighters!fighter_owner_id (
            fighter_name
          )
        `)
        .eq('id', fighter.fighter_pet_id)
        .single();

      ownerName = (ownershipData?.fighters as any)?.fighter_name;
    }

    const initialData: InitialFighterData = {
      fighter,
      gang: { 
        ...gang, 
        credits: gangCredits,
        gang_affiliation_name: gang.gang_affiliation?.name 
      },
      equipment: equipment?.map(item => ({
        fighter_equipment_id: item.fighter_equipment_id,
        equipment_id: item.equipment_id || item.custom_equipment_id || '',
        equipment_name: item.equipment_name,
        equipment_type: item.equipment_type as 'weapon' | 'wargear' | 'vehicle_upgrade',
        cost: item.purchase_cost, // Deprecated: for backward compatibility
        purchase_cost: Number(item.purchase_cost) || 0,
        base_cost: Number(item.original_cost) || Number(item.purchase_cost) || 0,
        weapon_profiles: item.weapon_profiles || [],
        core_equipment: false,
        is_master_crafted: item.is_master_crafted || false
      })) || [],
      skills: skills || {},
      effects: {
        injuries: effects?.injuries || [],
        advancements: effects?.advancements || [],
        bionics: effects?.bionics || [],
        cyberteknika: effects?.cyberteknika || [],
        'gene-smithing': effects?.['gene-smithing'] || [],
        'rig-glitches': effects?.['rig-glitches'] || [],
        augmentations: effects?.augmentations || [],
        equipment: effects?.equipment || [],
        user: effects?.user || []
      },
      vehicles: vehicles || [],
      totalCost: totalCost || fighter.credits,
      fighterType: fighterTypeData?.data ? {
        id: fighterTypeData.data.id,
        fighter_type: fighterTypeData.data.fighter_type,
        alliance_crew_name: fighterTypeData.data.alliance_crew_name
      } : undefined,
      fighterSubType: fighterSubTypeData?.data ? {
        id: fighterSubTypeData.data.id,
        sub_type_name: fighterSubTypeData.data.sub_type_name
      } : undefined,
      campaigns: campaignData?.data?.map((cg: any) => cg.campaign).filter(Boolean) || [],
      ownedBeasts: ownedBeastsData?.data?.map((ob: any) => ob.fighter_pet).filter(Boolean) || [],
      ownerName,
      gangFighters: gangFighters?.map(gf => ({
        id: gf.id,
        fighter_name: gf.fighter_name,
        fighter_type: gf.fighter_type,
        xp: gf.xp
      })) || [],
      gangPositioning: gangPositioning || {}
    };

    return (
      <FighterPageComponent 
        fighterId={id}
        userId={user.id}
        userPermissions={userPermissions}
        initialData={initialData}
      />
    );
  } catch (error) {
    console.error('Error fetching initial fighter data:', error);
    // Fallback to client-side loading if server-side fetch fails
    return (
      <FighterPageComponent 
        fighterId={id}
        userId={user.id}
        userPermissions={userPermissions}
      />
    );
  }
}
