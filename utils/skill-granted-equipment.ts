import 'server-only';

import type { EquipmentGrants } from '@/types/equipment';

/**
 * Equipment a skill comes with (N26 Headbutt grants the Headbutt weapon).
 *
 * The skill row says what it grants in skills.grants_equipment, the same shape
 * as equipment.grants_equipment. Only fixed grants are used: there is no step
 * where a player picks an option when a skill is added.
 *
 * Each granted item is a fighter_equipment row with fighter_skill_id pointing at
 * the fighter_skills row, so deleting the skill deletes the item (ON DELETE
 * CASCADE). Granted items are free: part of the skill, not something bought, so
 * they never change rating, wealth or credits.
 */

export interface GrantingFighterSkill {
  /** fighter_skills.id */
  fighter_skill_id: string;
  /** skills.id; custom skills (null) never grant equipment */
  skill_id: string | null;
}

export interface SkillGrantedEquipment {
  fighter_equipment_id: string;
  fighter_skill_id: string;
  equipment_id: string;
  equipment_name: string;
  equipment_type: string;
  equipment_category: string;
  cost: number;
  weapon_profiles: any[];
}

export async function grantEquipmentForSkills(
  supabase: any,
  params: {
    fighterId: string;
    gangId: string;
    userId: string;
    skills: GrantingFighterSkill[];
  }
): Promise<SkillGrantedEquipment[]> {
  const skillIds = [...new Set(params.skills.map(s => s.skill_id).filter((id): id is string => !!id))];
  if (skillIds.length === 0) return [];

  try {
    const { data: grantingSkills, error: skillsError } = await supabase
      .from('skills')
      .select('id, grants_equipment')
      .in('id', skillIds)
      .not('grants_equipment', 'is', null);

    if (skillsError) {
      console.error('Failed to load skill equipment grants:', skillsError);
      return [];
    }
    if (!grantingSkills || grantingSkills.length === 0) return [];

    const grantsBySkillId = new Map<string, string[]>();
    for (const skill of grantingSkills) {
      const grants = skill.grants_equipment as EquipmentGrants | null;
      if (grants?.selection_type !== 'fixed' || !grants.options?.length) continue;
      grantsBySkillId.set(skill.id, grants.options.map(opt => opt.equipment_id));
    }
    if (grantsBySkillId.size === 0) return [];

    const equipmentIds = [...new Set([...grantsBySkillId.values()].flat())];
    const { data: equipmentRows, error: equipmentError } = await supabase
      .from('equipment')
      .select('id, equipment_name, equipment_type, equipment_category, cost')
      .in('id', equipmentIds);

    if (equipmentError || !equipmentRows) {
      console.error('Failed to load skill-granted equipment:', equipmentError);
      return [];
    }
    const equipmentById = new Map<string, any>(equipmentRows.map((e: any) => [e.id, e]));

    const inserts = [];
    for (const fighterSkill of params.skills) {
      const grantedIds = fighterSkill.skill_id ? grantsBySkillId.get(fighterSkill.skill_id) : undefined;
      for (const equipmentId of grantedIds ?? []) {
        const equipment = equipmentById.get(equipmentId);
        if (!equipment) continue;
        inserts.push({
          fighter_id: params.fighterId,
          gang_id: params.gangId,
          equipment_id: equipmentId,
          original_cost: equipment.cost ?? 0,
          purchase_cost: 0,
          fighter_skill_id: fighterSkill.fighter_skill_id,
          user_id: params.userId
        });
      }
    }
    if (inserts.length === 0) return [];

    const { data: inserted, error: insertError } = await supabase
      .from('fighter_equipment')
      .insert(inserts)
      .select('id, equipment_id, fighter_skill_id');

    if (insertError || !inserted) {
      console.error('Failed to insert skill-granted equipment:', insertError);
      return [];
    }

    const weaponIds = equipmentRows
      .filter((e: any) => e.equipment_type === 'weapon')
      .map((e: any) => e.id);
    let weaponProfiles: any[] = [];
    if (weaponIds.length > 0) {
      const { data: profiles } = await supabase
        .from('weapon_profiles')
        .select('*')
        .in('equipment_id', weaponIds);
      weaponProfiles = profiles || [];
    }

    return inserted.map((row: any) => {
      const equipment = equipmentById.get(row.equipment_id);
      return {
        fighter_equipment_id: row.id,
        fighter_skill_id: row.fighter_skill_id,
        equipment_id: row.equipment_id,
        equipment_name: equipment?.equipment_name || 'Unknown',
        equipment_type: equipment?.equipment_type || 'unknown',
        equipment_category: equipment?.equipment_category || 'unknown',
        cost: 0,
        weapon_profiles: equipment?.equipment_type === 'weapon'
          ? weaponProfiles.filter((wp: any) => wp.equipment_id === row.equipment_id)
          : []
      };
    });
  } catch (error) {
    console.error('Error granting skill equipment:', error);
    return [];
  }
}
