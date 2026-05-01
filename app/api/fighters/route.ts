import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

// Add Edge Function configurations
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Define TypeScript types for better type checking
type Weapon = {
  weapon_id: string;
  weapon_name: string;
  range_short: number;
  range_long: number;
  acc_short: number;
  acc_long: number;
  strength: number;
  ap: number;
  damage: number;
  ammo: number;
  traits: string;
};

type Fighter = {
  id: string;
  fighter_name: string;
  fighter_type_id: string;
  fighter_type: string;
  fighter_sub_type?: string;
  fighter_sub_type_id?: string;
  fighter_class?: string;
  fighter_class_id?: string;
  credits: number;
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  attacks: number;
  weapons: Weapon[];
  updated_at?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const userId = await getUserIdFromClaims(supabase);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { 
    gang_id, 
    fighter_type_id,
    fighter_name,
    fighter_type,
    fighter_sub_type,
    fighter_sub_type_id,
    fighter_class,
    fighter_class_id
  } = await request.json();

  console.log('Received data:', { gang_id, fighter_type_id, fighter_name, fighter_type, fighter_sub_type, fighter_sub_type_id, fighter_class });

  if (!gang_id || !fighter_type_id || !fighter_name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    // First, get the fighter type data
    const { data: fighterTypeData, error: fighterTypeError } = await supabase
      .from('fighter_types')
      .select('*')
      .eq('fighter_type_id', fighter_type_id)
      .single();

    if (fighterTypeError) throw fighterTypeError;

    const fighterCost = fighterTypeData.cost;

    // Get the current gang data
    const { data: currentGang, error: gangFetchError } = await supabase
      .from("gangs")
      .select('rating, credits')
      .eq('id', gang_id)
      .single();

    if (gangFetchError) throw gangFetchError;

    // Check if the gang has enough credits
    if ((currentGang.credits || 0) < fighterCost) {
      return NextResponse.json({ error: "Not enough credits to add this fighter" }, { status: 400 });
    }

    // Now, insert the new fighter with all the statistics
    const { data: newFighter, error: fighterError } = await supabase
      .from("fighters")
      .insert([
        { 
          gang_id,
          fighter_type_id: fighter_type_id === "" ? null : fighter_type_id,
          fighter_name: fighter_name.trimEnd(),
          fighter_type,
          fighter_sub_type,
          fighter_sub_type_id: fighter_sub_type_id === "" ? null : fighter_sub_type_id,
          fighter_class,
          fighter_class_id: fighter_class_id === "" ? null : fighter_class_id,
          credits: fighterCost,
          movement: fighterTypeData.movement,
          weapon_skill: fighterTypeData.weapon_skill,
          ballistic_skill: fighterTypeData.ballistic_skill,
          strength: fighterTypeData.strength,
          toughness: fighterTypeData.toughness,
          wounds: fighterTypeData.wounds,
          initiative: fighterTypeData.initiative,
          attacks: fighterTypeData.attacks,
          leadership: fighterTypeData.leadership,
          cool: fighterTypeData.cool,
          willpower: fighterTypeData.willpower,
          intelligence: fighterTypeData.intelligence,
          updated_at: new Date().toISOString()
        },
      ])
      .select()
      .single();

    if (fighterError) throw fighterError;

    // Update the gang's rating, credits, and last_updated
    const { data: updatedGang, error: gangUpdateError } = await supabase
      .from("gangs")
      .update({ 
        rating: (currentGang.rating || 0) + fighterCost,
        credits: (currentGang.credits || 0) - fighterCost,
        last_updated: new Date().toISOString()
      })
      .eq('id', gang_id)
      .select()
      .single();

    if (gangUpdateError) throw gangUpdateError;

    return NextResponse.json({ 
      fighter: { 
        ...newFighter, 
        fighter_id: newFighter.id,
        fighter_type: fighterTypeData.fighter_type
      }, 
      gang: updatedGang 
    });
  } catch (error) {
    console.error('Error adding fighter and updating gang:', error);
    return NextResponse.json({ error: "Failed to add fighter and update gang" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangId = searchParams.get('gang_id');
  const includeLoadouts = searchParams.get('loadouts') === 'true';

  if (!gangId) {
    return NextResponse.json({ error: 'Gang ID is required' }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    // Fetch fighters
    const { data: fighters, error: fightersError } = await supabase
      .from('fighters')
      .select(`
        id,
        fighter_name,
        fighter_type_id,
        fighter_type,
        fighter_sub_type,
        fighter_sub_type_id,
        fighter_class,
        fighter_class_id,
        credits,
        cost_adjustment,
        movement,
        weapon_skill,
        ballistic_skill,
        strength,
        toughness,
        wounds,
        initiative,
        leadership,
        cool,
        willpower,
        intelligence,
        attacks,
        updated_at,
        fighter_pet_id
      `)
      .eq('gang_id', gangId);

    if (fightersError) throw fightersError;

    // Fetch all fighter types
    const { data: fighterTypes, error: typesError } = await supabase
      .from('fighter_types')
      .select('id, fighter_type');

    if (typesError) throw typesError;

    // Create a map of fighter type ids to fighter types
    const fighterTypeMap = Object.fromEntries(
      fighterTypes.map(type => [type.id, type.fighter_type])
    );

    // If loadouts are not requested, return the existing response
    if (!includeLoadouts) {
      // Fetch all fighter_weapons for the fetched fighters
      const { data: fighterWeapons, error: weaponsError } = await supabase
        .from('fighter_weapons')
        .select('fighter_id, weapon_id')
        .eq('fighter_id', gangId);

      if (weaponsError) throw weaponsError;

      // Fetch all weapons in one query
      const weaponIds = fighterWeapons.map(fw => fw.weapon_id);
      const { data: weapons, error: weaponsDataError } = await supabase
        .from('weapons')
        .select('id, weapon_name, range_short, range_long, acc_short, acc_long, strength, ap, damage, ammo, traits')
        .in('id', weaponIds);

      if (weaponsDataError) throw weaponsDataError;

      // Create a map of weapon_id to weapon details
      const weaponMap: Record<string, Weapon> = {};
      weapons.forEach(weapon => {
        weaponMap[weapon.id] = {
          weapon_id: weapon.id,
          weapon_name: weapon.weapon_name,
          range_short: weapon.range_short,
          range_long: weapon.range_long,
          acc_short: weapon.acc_short,
          acc_long: weapon.acc_long,
          strength: weapon.strength,
          ap: weapon.ap,
          damage: weapon.damage,
          ammo: weapon.ammo,
          traits: weapon.traits
        };
      });

      // Create a map of fighter_id to weapons
      const fighterWeaponsMap: Record<string, Weapon[]> = {};
      fighterWeapons.forEach(fw => {
        if (!fighterWeaponsMap[fw.fighter_id]) {
          fighterWeaponsMap[fw.fighter_id] = [];
        }
        if (weaponMap[fw.weapon_id]) {
          fighterWeaponsMap[fw.fighter_id].push(weaponMap[fw.weapon_id]);
        }
      });
      const fightersWithTypes = fighters.map(fighter => ({
        id: fighter.id,
        fighter_name: fighter.fighter_name,
        fighter_type_id: fighter.fighter_type_id,
        fighter_type: fighterTypeMap[fighter.fighter_type_id] || 'Unknown Type',
        fighter_sub_type: fighter.fighter_sub_type,
        fighter_sub_type_id: fighter.fighter_sub_type_id,
        fighter_class: fighter.fighter_class,
        fighter_class_id: fighter.fighter_class_id,
        credits: fighter.credits,
        movement: fighter.movement,
        weapon_skill: fighter.weapon_skill,
        ballistic_skill: fighter.ballistic_skill,
        strength: fighter.strength,
        toughness: fighter.toughness,
        wounds: fighter.wounds,
        initiative: fighter.initiative,
        leadership: fighter.leadership,
        cool: fighter.cool,
        willpower: fighter.willpower,
        intelligence: fighter.intelligence,
        attacks: fighter.attacks,
        updated_at: fighter.updated_at,
        weapons: fighterWeaponsMap[fighter.id] || []
      }));

      console.log('Fighters with types and weapons:', JSON.stringify(fightersWithTypes, null, 2));
      return NextResponse.json(fightersWithTypes);
    }

    // Fetch additional data for loadouts
    // Filter out exotic beasts - they are treated as equipment, not standalone fighters
    const filteredFighters = fighters.filter(f => f.fighter_class !== 'Exotic Beast');
    const fighterIds = filteredFighters.map(f => f.id);

    // If no fighters, return empty array
    if (fighterIds.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch all fighter equipment
    const { data: fighterEquipment, error: equipmentError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        fighter_id,
        equipment_id,
        purchase_cost,
        equipment (
          equipment_name,
          equipment_type
        )
      `)
      .in('fighter_id', fighterIds);

    if (equipmentError) throw equipmentError;

    // Fetch all fighter skills
    const { data: fighterSkills, error: skillsError } = await supabase
      .from('fighter_skills')
      .select('fighter_id, credits_increase')
      .in('fighter_id', fighterIds);

    if (skillsError) throw skillsError;

    // Fetch all fighter effects
    const { data: fighterEffects, error: effectsError } = await supabase
      .from('fighter_effects')
      .select('fighter_id, type_specific_data')
      .in('fighter_id', fighterIds);

    if (effectsError) throw effectsError;

    // Fetch all fighter vehicles
    const { data: fighterVehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('id, fighter_id, cost')
      .in('fighter_id', fighterIds);

    if (vehiclesError) throw vehiclesError;

    // Fetch vehicle equipment and effects separately
    const vehicleIds = fighterVehicles?.map(v => v.id) || [];

    const [vehicleEquipment, vehicleEffects] = await Promise.all([
      vehicleIds.length > 0
        ? supabase
            .from('fighter_equipment')
            .select('vehicle_id, purchase_cost')
            .in('vehicle_id', vehicleIds)
        : Promise.resolve({ data: [] }),
      vehicleIds.length > 0
        ? supabase
            .from('fighter_effects')
            .select('vehicle_id, type_specific_data')
            .in('vehicle_id', vehicleIds)
        : Promise.resolve({ data: [] })
    ]);

    // Fetch all loadouts
    const { data: loadouts, error: loadoutsError } = await supabase
      .from('fighter_loadouts')
      .select('id, fighter_id, loadout_name')
      .in('fighter_id', fighterIds)
      .order('created_at', { ascending: true });

    if (loadoutsError) throw loadoutsError;

    // Fetch loadout equipment mappings
    const loadoutIds = loadouts?.map(l => l.id) || [];
    const { data: loadoutEquipment, error: loadoutEquipmentError } = loadoutIds.length > 0
      ? await supabase
          .from('fighter_loadout_equipment')
          .select('loadout_id, fighter_equipment_id')
          .in('loadout_id', loadoutIds)
      : { data: [], error: null };

    if (loadoutEquipmentError) throw loadoutEquipmentError;

    // Check for owned beasts
    const { data: ownedBeasts, error: ownedBeastsError } = fighterIds.length > 0
      ? await supabase
          .from('fighter_exotic_beasts')
          .select('fighter_owner_id, fighter_pet_id')
          .in('fighter_owner_id', fighterIds)
      : { data: [], error: null };

    if (ownedBeastsError) throw ownedBeastsError;

    // Create maps for efficient lookup
    const equipmentByFighter = new Map<string, any[]>();
    fighterEquipment?.forEach(eq => {
      if (!equipmentByFighter.has(eq.fighter_id)) {
        equipmentByFighter.set(eq.fighter_id, []);
      }
      equipmentByFighter.get(eq.fighter_id)!.push(eq);
    });

    const skillsByFighter = new Map<string, number>();
    fighterSkills?.forEach(skill => {
      const current = skillsByFighter.get(skill.fighter_id) || 0;
      skillsByFighter.set(skill.fighter_id, current + (skill.credits_increase || 0));
    });

    const effectsByFighter = new Map<string, number>();
    fighterEffects?.forEach(effect => {
      const current = effectsByFighter.get(effect.fighter_id) || 0;
      const creditsIncrease = effect.type_specific_data?.credits_increase || 0;
      effectsByFighter.set(effect.fighter_id, current + creditsIncrease);
    });

    // Create maps for vehicle equipment and effects by vehicle_id
    const equipmentByVehicle = new Map<string, any[]>();
    vehicleEquipment.data?.forEach(eq => {
      if (!equipmentByVehicle.has(eq.vehicle_id)) {
        equipmentByVehicle.set(eq.vehicle_id, []);
      }
      equipmentByVehicle.get(eq.vehicle_id)!.push(eq);
    });

    const effectsByVehicle = new Map<string, any[]>();
    vehicleEffects.data?.forEach(effect => {
      if (!effectsByVehicle.has(effect.vehicle_id)) {
        effectsByVehicle.set(effect.vehicle_id, []);
      }
      effectsByVehicle.get(effect.vehicle_id)!.push(effect);
    });

    const vehiclesByFighter = new Map<string, number>();
    fighterVehicles?.forEach(vehicle => {
      let vehicleCost = vehicle.cost || 0;

      // Add vehicle equipment costs
      const vehEquipment = equipmentByVehicle.get(vehicle.id) || [];
      vehicleCost += vehEquipment.reduce((sum, eq) => sum + (eq.purchase_cost || 0), 0);

      // Add vehicle effects costs
      const vehEffects = effectsByVehicle.get(vehicle.id) || [];
      vehicleCost += vehEffects.reduce((sum, effect) =>
        sum + (effect.type_specific_data?.credits_increase || 0), 0);

      const current = vehiclesByFighter.get(vehicle.fighter_id) || 0;
      vehiclesByFighter.set(vehicle.fighter_id, current + vehicleCost);
    });

    // Create map of loadout_id to equipment_ids
    const equipmentByLoadout = new Map<string, Set<string>>();
    loadoutEquipment?.forEach(le => {
      if (!equipmentByLoadout.has(le.loadout_id)) {
        equipmentByLoadout.set(le.loadout_id, new Set());
      }
      equipmentByLoadout.get(le.loadout_id)!.add(le.fighter_equipment_id);
    });

    // Create map of loadouts by fighter
    const loadoutsByFighter = new Map<string, any[]>();
    loadouts?.forEach(loadout => {
      if (!loadoutsByFighter.has(loadout.fighter_id)) {
        loadoutsByFighter.set(loadout.fighter_id, []);
      }
      loadoutsByFighter.get(loadout.fighter_id)!.push(loadout);
    });

    // Check which fighters are owned beasts
    const ownedBeastIds = new Set(ownedBeasts?.map(ob => ob.fighter_pet_id) || []);

    // Map fighters with loadouts
    const fightersWithLoadouts = filteredFighters.map(fighter => {
      const isOwnedBeast = fighter.fighter_pet_id && ownedBeastIds.has(fighter.id);
      const baseCost = fighter.credits || 0;
      const costAdjustment = fighter.cost_adjustment || 0;
      const skillsCost = skillsByFighter.get(fighter.id) || 0;
      const effectsCost = effectsByFighter.get(fighter.id) || 0;
      const vehicleCost = vehiclesByFighter.get(fighter.id) || 0;

      // Calculate beast costs (simplified - would need recursive calculation for full accuracy)
      const beastCosts = 0; // TODO: Implement if needed

      const allEquipment = equipmentByFighter.get(fighter.id) || [];
      const allEquipmentCost = allEquipment.reduce((sum, eq) => sum + (eq.purchase_cost || 0), 0);

      const totalCost = isOwnedBeast ? 0 :
        baseCost + allEquipmentCost + skillsCost + effectsCost + vehicleCost + costAdjustment + beastCosts;

      // Process loadouts
      const fighterLoadouts = loadoutsByFighter.get(fighter.id) || [];
      const processedLoadouts = fighterLoadouts.map(loadout => {
        const equipmentIdsInLoadout = equipmentByLoadout.get(loadout.id) || new Set();

        // Filter equipment to only those in this loadout
        const loadoutEquipmentList = allEquipment
          .filter(eq => equipmentIdsInLoadout.has(eq.id))
          .map(eq => ({
            id: eq.id,
            equipment_name: eq.equipment?.equipment_name || 'Unknown',
            cost: eq.purchase_cost || 0
          }));

        const equipmentCost = loadoutEquipmentList.reduce((sum, eq) => sum + eq.cost, 0);
        const loadoutTotal = isOwnedBeast ? 0 :
          baseCost + equipmentCost + skillsCost + effectsCost + vehicleCost + costAdjustment + beastCosts;

        return {
          id: loadout.id,
          loadout_name: loadout.loadout_name,
          equipment: loadoutEquipmentList,
          equipment_cost: equipmentCost,
          loadout_total: loadoutTotal
        };
      });

      return {
        id: fighter.id,
        fighter_name: fighter.fighter_name,
        fighter_type_id: fighter.fighter_type_id,
        fighter_type: fighterTypeMap[fighter.fighter_type_id] || 'Unknown Type',
        fighter_sub_type: fighter.fighter_sub_type,
        fighter_sub_type_id: fighter.fighter_sub_type_id,
        fighter_class: fighter.fighter_class,
        fighter_class_id: fighter.fighter_class_id,

        // Cost breakdown
        base_cost: baseCost,
        skills_cost: skillsCost,
        effects_cost: effectsCost,
        vehicle_cost: vehicleCost,
        cost_adjustment: costAdjustment,
        beast_costs: beastCosts,
        total_cost: totalCost,

        // Stats
        movement: fighter.movement,
        weapon_skill: fighter.weapon_skill,
        ballistic_skill: fighter.ballistic_skill,
        strength: fighter.strength,
        toughness: fighter.toughness,
        wounds: fighter.wounds,
        initiative: fighter.initiative,
        leadership: fighter.leadership,
        cool: fighter.cool,
        willpower: fighter.willpower,
        intelligence: fighter.intelligence,
        attacks: fighter.attacks,
        updated_at: fighter.updated_at,

        // Loadouts
        loadouts: processedLoadouts
      };
    });

    return NextResponse.json(fightersWithLoadouts);
  } catch (error) {
    console.error('Error fetching fighters:', error);
    return NextResponse.json({ error: 'Error fetching fighters' }, { status: 500 });
  }
}
