import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

// Add type definitions at the top
interface Skill {
  id: string;
  name: string;
  skill_type_id: string;
}

interface FighterDefault {
  id: string;
  skills: Skill;
}

interface FormattedSkill {
  id: string;
  skill_name: string;
  skill_type: string;
}

// Add these interfaces for equipment options
interface BaseEquipment {
  id: string;
  quantity: number;
  included: boolean;
  cost: number;
}

interface EquipmentOption {
  id: string;
  max_quantity: number;
  cost: number;
}

interface ReplacementOption {
  type: 'replacement';
  replace_quantity: number;
  options: EquipmentOption[];
}

interface WeaponOptions {
  base_equipment: BaseEquipment[];
  options: ReplacementOption[];
  upgrades: EquipmentOption[];
}

interface EquipmentOptions {
  weapons?: WeaponOptions;
}

// Update the existing GangAddition interface
interface GangAddition {
  id: string;
  gang_addition_name: string;
  alignment: string;
  cost: number;
  special_rules: string;
  movement: string;
  weapon_skill: string;
  ballistic_skill: string;
  strength: string;
  toughness: string;
  wounds: string;
  initiative: string;
  attacks: string;
  leadership: string;
  cool: string;
  willpower: string;
  intelligence: string;
  fighter_type: string;
  fighter_class: string;
  gang_availability: number;
  equipment_options?: EquipmentOptions;
}

interface EquipmentItem {
  id: string;
  equipment_name: string;
}

interface EquipmentDetails {
  [key: string]: {
    id: string;
    name: string;
  };
}

export async function GET(
  request: Request,
  { params }: { params: { id: string, additionId: string } }
) {
  try {
    const supabase = createClient();
    let equipmentDetails: EquipmentDetails = {};

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the gang addition details including equipment_options
    const { data: addition, error: additionError } = await supabase
      .from('gang_additions')
      .select(`
        id,
        gang_addition_name,
        alignment,
        cost,
        special_rules,
        movement,
        weapon_skill,
        ballistic_skill,
        strength,
        toughness,
        wounds,
        initiative,
        attacks,
        leadership,
        cool,
        willpower,
        intelligence,
        fighter_type,
        fighter_class,
        gang_availability,
        equipment_options
      `)
      .eq('id', params.additionId)
      .single();

    if (additionError) {
      console.error('Error fetching addition:', additionError);
      return NextResponse.json({ error: 'Failed to fetch gang addition' }, { status: 500 });
    }

    // Log the equipment_options to see what we're getting
    console.log('Raw equipment_options:', addition?.equipment_options);

    // Get all equipment IDs from the equipment_options
    const equipmentIds = new Set<string>();

    if (addition?.equipment_options?.weapons) {
      const weapons = addition.equipment_options.weapons;
      
      // Log the weapons object to see its structure
      console.log('Weapons object:', weapons);

      // Add IDs from options array
      if (weapons.options) {
        weapons.options.forEach((option: { id: string; cost: number; max_quantity: number }) => {
          if (option.id) {
            equipmentIds.add(option.id);
          }
        });
      }

      // Log collected IDs
      console.log('Collected equipment IDs:', Array.from(equipmentIds));

      if (equipmentIds.size > 0) {
        // Fetch equipment details
        const { data: equipment, error: equipmentError } = await supabase
          .from('equipment')
          .select('id, equipment_name')
          .in('id', Array.from(equipmentIds));

        console.log('Equipment query result:', {
          ids: Array.from(equipmentIds),
          data: equipment,
          error: equipmentError
        });

        if (equipment && equipment.length > 0) {
          equipmentDetails = equipment.reduce((acc, item) => ({
            ...acc,
            [item.id]: {
              id: item.id,
              name: item.equipment_name
            }
          }), {});
        }

        // Log final equipment details
        console.log('Final equipment details:', equipmentDetails);
      }
    }

    // Then get the skill IDs from fighter_defaults
    const { data: defaultSkills, error: defaultSkillsError } = await supabase
      .from('fighter_defaults')
      .select('skill_id')
      .eq('gang_addition_id', params.additionId)
      .not('skill_id', 'is', null);

    if (defaultSkillsError) {
      console.error('Error fetching default skills:', defaultSkillsError);
      return NextResponse.json({ error: 'Failed to fetch default skills' }, { status: 500 });
    }

    // If we have any skill IDs, get the skill details
    let skills: FormattedSkill[] = [];
    if (defaultSkills && defaultSkills.length > 0) {
      const skillIds = defaultSkills.map(def => def.skill_id);
      const { data: skillDetails, error: skillsError } = await supabase
        .from('skills')
        .select('id, name, skill_type_id')
        .in('id', skillIds);

      if (skillsError) {
        console.error('Error fetching skills:', skillsError);
        return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 });
      }

      skills = (skillDetails || []).map(skill => ({
        id: skill.id,
        skill_name: skill.name,
        skill_type: skill.skill_type_id
      }));
    }

    // Log the final response
    const response = {
      ...addition,
      max_count: addition.gang_availability,
      default_skills: skills,
      equipment_details: equipmentDetails
    };
    console.log('Final response equipment_details:', response.equipment_details);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Server error:', error);
    console.error('Full error details:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 