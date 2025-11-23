import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { Skill } from '@/types/fighter';
import { getUserIdFromClaims } from "@/utils/auth";

interface Equipment {
  id: string;
  cost: number;
}

interface WeaponProfile {
  id: string;
  profile_name: string;
  range_short: string;
  range_long: string;
  acc_short: string;
  acc_long: string;
  strength: string;
  damage: string;
  ap: string;
  ammo: string;
  traits: string[];
  weapon_group_id: string;
}

interface Weapon {
  weapon_name: string;
  weapon_id: string;
  cost: number;
  fighter_weapon_id: string;
  weapon_profiles: WeaponProfile[];
}

interface Wargear {
  wargear_name: string;
  wargear_id: string;
  cost: number;
  fighter_weapon_id: string;
}

interface EquipmentDetails {
  id: string;
  equipment_name: string;
  equipment_type: string;
  weapon_profiles: {
    id: string;
    profile_name: string;
    range_short: string;
    range_long: string;
    acc_short: string;
    acc_long: string;
    strength: string;
    damage: string;
    ap: string;
    ammo: string;
    traits: string[];
    weapon_group_id: string;
    sort_order: number;
  }[];
}

interface FighterEquipment {
  equipment_id: string;
  purchase_cost: number;
  original_cost: number;
  equipment: {
    id: string;
    equipment_name: string;
    equipment_type: string;
    weapon_profiles: WeaponProfile[];
  };
}

interface FighterSkill {
  skills: Skill[];
}

interface FighterWithDetails {
  fighter_equipment: FighterEquipment[];
  fighter_skills: FighterSkill[];
  [key: string]: any;
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  try {
    // Get authenticated user
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const { gangAddition, selectedEquipment } = await request.json();
    console.log('Received request data:', { gangAddition, selectedEquipment });
    
    // Verify gang ownership
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('credits, rating, user_id')
      .eq('id', params.id)
      .single();

    if (gangError) {
      console.error('Error fetching gang:', gangError);
      return NextResponse.json({ error: "Gang not found" }, { status: 404 });
    }

    if (gang.user_id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Create the fighter
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .insert({
        gang_id: params.id,
        fighter_name: gangAddition.fighter_name,
        fighter_type: gangAddition.fighter_type,
        fighter_class: gangAddition.fighter_class,
        credits: gangAddition.cost,
        movement: gangAddition.movement,
        weapon_skill: gangAddition.weapon_skill,
        ballistic_skill: gangAddition.ballistic_skill,
        strength: gangAddition.strength,
        toughness: gangAddition.toughness,
        wounds: gangAddition.wounds,
        initiative: gangAddition.initiative,
        attacks: gangAddition.attacks,
        leadership: gangAddition.leadership,
        cool: gangAddition.cool,
        willpower: gangAddition.willpower,
        intelligence: gangAddition.intelligence,
        special_rules: gangAddition.special_rules
      })
      .select()
      .single();

    if (fighterError) {
      console.error('Error creating fighter:', fighterError);
      throw fighterError;
    }

    console.log('Created fighter:', fighter);

    // Get fighter defaults
    const { data: fighterDefaults, error: defaultsError } = await supabase
      .from('fighter_defaults')
      .select(`
        id,
        equipment_id,
        skill_id
      `)
      .eq('gang_addition_id', gangAddition.id);

    if (defaultsError) {
      console.error('Error fetching fighter defaults:', defaultsError);
      throw defaultsError;
    }

    console.log('Fighter defaults:', fighterDefaults);

    // After getting fighter defaults
    if (fighterDefaults) {
      const defaultEquipmentIds = fighterDefaults
        .filter(def => def.equipment_id)
        .map(def => def.equipment_id);

      // Fetch details for default equipment
      if (defaultEquipmentIds.length > 0) {
        const { data: defaultEquipmentDetails, error: detailsError } = await supabase
          .from('equipment')
          .select(`
            id,
            equipment_name,
            equipment_type,
            weapon_profiles (
              id,
              profile_name,
              range_short,
              range_long,
              acc_short,
              acc_long,
              strength,
              damage,
              ap,
              ammo,
              traits,
              weapon_group_id,
              sort_order
            )
          `)
          .in('id', defaultEquipmentIds);

        if (detailsError) {
          console.error('Error fetching default equipment details:', detailsError);
          throw detailsError;
        }

        console.log('Default equipment details:', defaultEquipmentDetails);

        // Add default equipment to fighter_equipment and weapons array
        defaultEquipmentDetails?.forEach((equip: EquipmentDetails) => {
          if (equip.equipment_type === 'weapon') {
            weapons.push({
              weapon_name: equip.equipment_name,
              weapon_id: equip.id,
              cost: 0,
              fighter_weapon_id: `${fighter.id}_${equip.id}`,
              weapon_profiles: equip.weapon_profiles?.map(profile => ({
                id: profile.id,
                profile_name: profile.profile_name,
                range_short: profile.range_short,
                range_long: profile.range_long,
                acc_short: profile.acc_short,
                acc_long: profile.acc_long,
                strength: profile.strength,
                damage: profile.damage,
                ap: profile.ap,
                ammo: profile.ammo,
                traits: profile.traits,
                weapon_group_id: profile.weapon_group_id
              })) || []
            });
          }
        });

        // Insert default equipment
        const defaultEquipment = defaultEquipmentDetails.map(equip => ({
          fighter_id: fighter.id,
          equipment_id: equip.id,
          purchase_cost: 0,
          original_cost: 0
        }));

        const { error: defaultEquipError } = await supabase
          .from('fighter_equipment')
          .insert(defaultEquipment);

        if (defaultEquipError) {
          console.error('Error inserting default equipment:', defaultEquipError);
          throw defaultEquipError;
        }
      }

      // Add default skills to fighter_skills
      const defaultSkills = fighterDefaults
        .filter(def => def.skill_id)
        .map(def => ({
          fighter_id: fighter.id,
          skill_id: def.skill_id,
          is_advance: false,
          credits_increase: 0,
          xp_cost: '0',
          fighter_injury_id: null
        }));

      if (defaultSkills.length > 0) {
        console.log('Inserting default skills:', defaultSkills);
        const { error: defaultSkillError } = await supabase
          .from('fighter_skills')
          .insert(defaultSkills);

        if (defaultSkillError) {
          console.error('Error inserting default skills:', defaultSkillError);
          throw defaultSkillError;
        }
      }
    }

    const weapons: Weapon[] = [];
    const wargear: Wargear[] = [];

    if (selectedEquipment && selectedEquipment.length > 0) {
      console.log('Processing selected equipment:', selectedEquipment);

      // Fetch equipment details
      const { data: equipmentDetails, error: detailsError } = await supabase
        .from('equipment')
        .select(`
          id,
          equipment_name,
          equipment_type,
          weapon_profiles (
            id,
            profile_name,
            range_short,
            range_long,
            acc_short,
            acc_long,
            strength,
            damage,
            ap,
            ammo,
            traits,
            weapon_group_id,
            sort_order
          )
        `)
        .in('id', selectedEquipment.map((e: Equipment) => e.id));

      if (detailsError) {
        console.error('Error fetching equipment details:', detailsError);
        throw detailsError;
      }

      console.log('Fetched equipment details:', equipmentDetails);

      // Process only the selected equipment
      equipmentDetails?.forEach((equip: EquipmentDetails) => {
        const selectedEquip = selectedEquipment.find((e: Equipment) => e.id === equip.id);
        if (!selectedEquip) return;

        if (equip.equipment_type === 'weapon') {
          const weaponData = {
            fighter_id: fighter.id,
            weapon_id: equip.id,
            fighter_weapon_id: `${fighter.id}_${equip.id}`,
            cost: selectedEquip.cost
          };
          console.log('Adding weapon:', weaponData);

          weapons.push({
            weapon_name: equip.equipment_name,
            weapon_id: equip.id,
            cost: selectedEquip.cost,
            fighter_weapon_id: weaponData.fighter_weapon_id,
            weapon_profiles: equip.weapon_profiles?.map(profile => ({
              id: profile.id,
              profile_name: profile.profile_name,
              range_short: profile.range_short,
              range_long: profile.range_long,
              acc_short: profile.acc_short,
              acc_long: profile.acc_long,
              strength: profile.strength,
              damage: profile.damage,
              ap: profile.ap,
              ammo: profile.ammo,
              traits: profile.traits,
              weapon_group_id: profile.weapon_group_id
            })) || []
          });
        }
      });

      if (weapons.length > 0) {
        console.log('Inserting equipment:', weapons);
        const { error: equipmentError } = await supabase
          .from('fighter_equipment')
          .insert(
            weapons.map(weapon => ({
              fighter_id: fighter.id,
              equipment_id: weapon.weapon_id,
              purchase_cost: weapon.cost,
              original_cost: weapon.cost
            }))
          );

        if (equipmentError) {
          console.error('Error inserting fighter equipment:', equipmentError);
          throw equipmentError;
        }
      }
    }

    // Update gang's credits and rating
    const { error: updateError } = await supabase
      .from('gangs')
      .update({
        credits: gang.credits - parseInt(gangAddition.cost),
        rating: gang.rating + parseInt(gangAddition.cost)
      })
      .eq('id', params.id);

    if (updateError) {
      console.error('Error updating gang:', updateError);
      throw updateError;
    }

    // Before returning the response, let's fetch the complete fighter data
    const { data: fighterWithDetails, error: detailsError } = await supabase
      .from('fighters')
      .select(`
        *,
        fighter_equipment (
          equipment_id,
          purchase_cost,
          original_cost,
          equipment (
            id,
            equipment_name,
            equipment_type,
            weapon_profiles (*)
          )
        ),
        fighter_skills (
          skills (
            id,
            name,
            skill_type_id
          )
        )
      `)
      .eq('id', fighter.id)
      .single();

    if (detailsError) {
      console.error('Error fetching fighter details:', detailsError);
      throw detailsError;
    }

    // Process the equipment into weapons and wargear arrays with proper typing
    const processedWeapons = (fighterWithDetails as FighterWithDetails).fighter_equipment
      .filter((item: FighterEquipment) => item.equipment.equipment_type === 'weapon')
      .map((item: FighterEquipment) => ({
        weapon_name: item.equipment.equipment_name,
        weapon_id: item.equipment.id,
        cost: item.purchase_cost,
        fighter_weapon_id: `${fighter.id}_${item.equipment.id}`,
        weapon_profiles: item.equipment.weapon_profiles || []
      }));

    const processedWargear = (fighterWithDetails as FighterWithDetails).fighter_equipment
      .filter((item: FighterEquipment) => item.equipment.equipment_type === 'wargear')
      .map((item: FighterEquipment) => ({
        wargear_name: item.equipment.equipment_name,
        wargear_id: item.equipment.id,
        cost: item.purchase_cost,
        fighter_weapon_id: `${fighter.id}_${item.equipment.id}`
      }));

    return NextResponse.json({
      fighter: {
        ...fighter,
        weapons: processedWeapons,
        wargear: processedWargear,
        skills: (fighterWithDetails as FighterWithDetails).fighter_skills.map((fs: FighterSkill) => fs.skills)
      },
      updatedCredits: gang.credits - parseInt(gangAddition.cost),
      updatedRating: gang.rating + parseInt(gangAddition.cost)
    });

  } catch (error) {
    console.error('Error in POST /api/gangs/[id]/fighters:', error);
    return NextResponse.json(
      { error: "Failed to add fighter", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}