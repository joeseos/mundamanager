import { createClient } from "@/utils/supabase/server";
import { CustomFighterType } from "@/types/fighter";

export async function getUserCustomFighterTypes(userId: string): Promise<CustomFighterType[]> {
  const supabase = await createClient();

  const { data: customFighterTypes, error } = await supabase
    .from('custom_fighter_types')
    .select('*')
    .eq('user_id', userId)
    .order('fighter_type', { ascending: true });

  if (error) {
    console.error('Error fetching custom fighter types:', error);
    throw new Error(`Failed to fetch custom fighter types: ${error.message}`);
  }

  if (!customFighterTypes || customFighterTypes.length === 0) {
    return [];
  }

  // Fetch skill access for all custom fighter types with skill type names
  const fighterIds = customFighterTypes.map(f => f.id);
  const { data: skillAccessData, error: skillAccessError } = await supabase
    .from('fighter_type_skill_access')
    .select(`
      custom_fighter_type_id,
      skill_type_id,
      access_level,
      skill_types (
        id,
        name
      )
    `)
    .in('custom_fighter_type_id', fighterIds);

  // Fetch default skills for all custom fighter types
  const { data: defaultSkillsData, error: defaultSkillsError } = await supabase
    .from('fighter_defaults')
    .select(`
      custom_fighter_type_id,
      skill_id,
      skills (
        id,
        name
      )
    `)
    .in('custom_fighter_type_id', fighterIds)
    .not('skill_id', 'is', null);

  // Fetch default equipment for all custom fighter types (both regular and custom equipment)
  const [defaultEquipmentResult, defaultCustomEquipmentResult] = await Promise.all([
    // Fetch regular equipment
    supabase
      .from('fighter_defaults')
      .select(`
        custom_fighter_type_id,
        equipment_id,
        equipment (
          id,
          equipment_name
        )
      `)
      .in('custom_fighter_type_id', fighterIds)
      .not('equipment_id', 'is', null),
    // Fetch custom equipment
    supabase
      .from('fighter_defaults')
      .select(`
        custom_fighter_type_id,
        custom_equipment_id,
        custom_equipment (
          id,
          equipment_name
        )
      `)
      .in('custom_fighter_type_id', fighterIds)
      .not('custom_equipment_id', 'is', null)
  ]);

  const defaultEquipmentError = defaultEquipmentResult.error || defaultCustomEquipmentResult.error;

  if (skillAccessError) {
    console.error('Error fetching skill access:', skillAccessError);
    throw new Error(`Failed to fetch skill access: ${skillAccessError.message}`);
  }

  if (defaultSkillsError) {
    console.error('Error fetching default skills:', defaultSkillsError);
    throw new Error(`Failed to fetch default skills: ${defaultSkillsError.message}`);
  }

  if (defaultEquipmentError) {
    console.error('Error fetching default equipment:', defaultEquipmentError);
    throw new Error(`Failed to fetch default equipment: ${defaultEquipmentError.message}`);
  }

  // Group skill access by custom fighter type ID
  const skillAccessByFighter = (skillAccessData || []).reduce((acc, row) => {
    if (!acc[row.custom_fighter_type_id]) {
      acc[row.custom_fighter_type_id] = [];
    }
    acc[row.custom_fighter_type_id].push({
      skill_type_id: row.skill_type_id,
      access_level: row.access_level,
      skill_type_name: (row.skill_types as any)?.name || 'Unknown'
    });
    return acc;
  }, {} as Record<string, { skill_type_id: string; access_level: 'primary' | 'secondary' | 'allowed'; skill_type_name: string }[]>);

  // Group default skills by custom fighter type ID
  const defaultSkillsByFighter = (defaultSkillsData || []).reduce((acc, row) => {
    if (!acc[row.custom_fighter_type_id]) {
      acc[row.custom_fighter_type_id] = [];
    }
    acc[row.custom_fighter_type_id].push({
      skill_id: row.skill_id,
      skill_name: (row.skills as any)?.name || 'Unknown'
    });
    return acc;
  }, {} as Record<string, { skill_id: string; skill_name: string }[]>);

  // Group default equipment by custom fighter type ID (combine regular and custom equipment)
  const defaultEquipmentByFighter: Record<string, { equipment_id: string; equipment_name: string }[]> = {};

  // Process regular equipment
  (defaultEquipmentResult.data || []).forEach((row) => {
    if (!defaultEquipmentByFighter[row.custom_fighter_type_id]) {
      defaultEquipmentByFighter[row.custom_fighter_type_id] = [];
    }
    defaultEquipmentByFighter[row.custom_fighter_type_id].push({
      equipment_id: row.equipment_id,
      equipment_name: (row.equipment as any)?.equipment_name || 'Unknown'
    });
  });

  // Process custom equipment (prefix ID to match API format)
  (defaultCustomEquipmentResult.data || []).forEach((row) => {
    if (!defaultEquipmentByFighter[row.custom_fighter_type_id]) {
      defaultEquipmentByFighter[row.custom_fighter_type_id] = [];
    }
    defaultEquipmentByFighter[row.custom_fighter_type_id].push({
      equipment_id: `custom_${row.custom_equipment_id}`,
      equipment_name: `${(row.custom_equipment as any)?.equipment_name || 'Unknown'} (Custom)`
    });
  });

  // Combine fighter data with skill access, default skills, and default equipment
  const fightersWithExtendedData = customFighterTypes.map(fighter => ({
    ...fighter,
    skill_access: skillAccessByFighter[fighter.id] || [],
    default_skills: defaultSkillsByFighter[fighter.id] || [],
    default_equipment: defaultEquipmentByFighter[fighter.id] || []
  }));

  return fightersWithExtendedData;
}