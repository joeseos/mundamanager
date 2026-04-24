import { SupabaseClient } from '@supabase/supabase-js';

interface DuplicateResult {
  newCustomGangTypeId: string;
  customFighterTypeIdMap: Map<string, string>;
  customSkillIdMap: Map<string, string>;
}

/**
 * Duplicates a custom gang type and all related assets (fighter types, skill types,
 * skills, equipment, weapon profiles, skill access, fighter defaults) for a target user.
 *
 * Used when a user creates or copies a gang based on someone else's custom gang type,
 * so that the new gang is not affected if the original owner deletes their assets.
 */
export async function duplicateCustomGangType(
  supabase: SupabaseClient,
  sourceCustomGangTypeId: string,
  targetUserId: string
): Promise<DuplicateResult> {
  const customFighterTypeIdMap = new Map<string, string>();
  const customSkillIdMap = new Map<string, string>();

  // Step A: Duplicate the custom gang type
  const { data: sourceCustomGangType, error: cgtError } = await supabase
    .from('custom_gang_types')
    .select('*')
    .eq('id', sourceCustomGangTypeId)
    .single();

  if (cgtError || !sourceCustomGangType) {
    throw new Error('Source custom gang type not found');
  }

  const { data: newCgt, error: newCgtError } = await supabase
    .from('custom_gang_types')
    .insert({
      user_id: targetUserId,
      gang_type: sourceCustomGangType.gang_type,
      alignment: sourceCustomGangType.alignment,
      trading_post_type_id: sourceCustomGangType.trading_post_type_id,
      default_image_urls: sourceCustomGangType.default_image_urls,
    })
    .select('id')
    .single();

  if (newCgtError || !newCgt) {
    throw new Error(`Failed to duplicate custom gang type: ${newCgtError?.message}`);
  }

  const newCustomGangTypeId = newCgt.id;

  // Step B: Duplicate custom fighter types for this gang type
  const { data: sourceCustomFighters, error: cfError } = await supabase
    .from('custom_fighter_types')
    .select('*')
    .eq('custom_gang_type_id', sourceCustomGangTypeId);

  if (cfError) {
    throw new Error(`Failed to load custom fighter types: ${cfError.message}`);
  }

  const oldCustomFighterTypeIds: string[] = [];

  if (sourceCustomFighters && sourceCustomFighters.length > 0) {
    for (const cf of sourceCustomFighters) {
      const { id: _id, created_at: _ca, updated_at: _ua, user_id: _uid, custom_gang_type_id: _cgtid, ...cfData } = cf;
      oldCustomFighterTypeIds.push(cf.id);

      const { data: newCf, error: newCfError } = await supabase
        .from('custom_fighter_types')
        .insert({
          ...cfData,
          user_id: targetUserId,
          custom_gang_type_id: newCustomGangTypeId,
        })
        .select('id')
        .single();

      if (newCfError || !newCf) {
        throw new Error(`Failed to duplicate custom fighter type: ${newCfError?.message}`);
      }

      customFighterTypeIdMap.set(cf.id, newCf.id);
    }
  }

  if (oldCustomFighterTypeIds.length > 0) {
    // Step C: Duplicate custom skill types + custom skills
    const { data: skillAccessRows } = await supabase
      .from('fighter_type_skill_access')
      .select('custom_skill_type_id')
      .in('custom_fighter_type_id', oldCustomFighterTypeIds)
      .not('custom_skill_type_id', 'is', null);

    const uniqueCustomSkillTypeIds = Array.from(new Set(
      (skillAccessRows ?? []).map(r => r.custom_skill_type_id).filter(Boolean) as string[]
    ));

    const customSkillTypeIdMap = new Map<string, string>();

    if (uniqueCustomSkillTypeIds.length > 0) {
      const { data: sourceSkillTypes } = await supabase
        .from('custom_skill_types')
        .select('*')
        .in('id', uniqueCustomSkillTypeIds);

      if (sourceSkillTypes) {
        for (const st of sourceSkillTypes) {
          const { data: newSt, error: newStError } = await supabase
            .from('custom_skill_types')
            .insert({
              name: st.name,
              user_id: targetUserId,
            })
            .select('id')
            .single();

          if (newStError || !newSt) {
            throw new Error(`Failed to duplicate custom skill type: ${newStError?.message}`);
          }

          customSkillTypeIdMap.set(st.id, newSt.id);
        }
      }

      const { data: sourceCustomSkills } = await supabase
        .from('custom_skills')
        .select('*')
        .in('custom_skill_type_id', uniqueCustomSkillTypeIds);

      if (sourceCustomSkills) {
        for (const cs of sourceCustomSkills) {
          const newSkillTypeId = customSkillTypeIdMap.get(cs.custom_skill_type_id);
          if (!newSkillTypeId) continue;

          const { data: newCs, error: newCsError } = await supabase
            .from('custom_skills')
            .insert({
              skill_name: cs.skill_name,
              user_id: targetUserId,
              skill_type_id: cs.skill_type_id,
              custom_skill_type_id: newSkillTypeId,
            })
            .select('id')
            .single();

          if (newCsError || !newCs) {
            throw new Error(`Failed to duplicate custom skill: ${newCsError?.message}`);
          }

          customSkillIdMap.set(cs.id, newCs.id);
        }
      }
    }

    // Step D: Duplicate custom equipment referenced in fighter defaults
    const { data: defaultsWithCustomEquip } = await supabase
      .from('fighter_defaults')
      .select('custom_equipment_id')
      .in('custom_fighter_type_id', oldCustomFighterTypeIds)
      .not('custom_equipment_id', 'is', null);

    const uniqueCustomEquipmentIds = Array.from(new Set(
      (defaultsWithCustomEquip ?? []).map(r => r.custom_equipment_id).filter(Boolean) as string[]
    ));

    const customEquipmentIdMap = new Map<string, string>();

    if (uniqueCustomEquipmentIds.length > 0) {
      const { data: sourceCustomEquipment } = await supabase
        .from('custom_equipment')
        .select('*')
        .in('id', uniqueCustomEquipmentIds);

      if (sourceCustomEquipment) {
        for (const ce of sourceCustomEquipment) {
          const { id: _id, created_at: _ca, updated_at: _ua, user_id: _uid, ...ceData } = ce;

          const { data: newCe, error: newCeError } = await supabase
            .from('custom_equipment')
            .insert({
              ...ceData,
              user_id: targetUserId,
            })
            .select('id')
            .single();

          if (newCeError || !newCe) {
            throw new Error(`Failed to duplicate custom equipment: ${newCeError?.message}`);
          }

          customEquipmentIdMap.set(ce.id, newCe.id);
        }
      }

      // Duplicate custom weapon profiles
      const { data: sourceProfiles } = await supabase
        .from('custom_weapon_profiles')
        .select('*')
        .in('custom_equipment_id', uniqueCustomEquipmentIds);

      if (sourceProfiles && sourceProfiles.length > 0) {
        for (const profile of sourceProfiles) {
          const newEquipId = customEquipmentIdMap.get(profile.custom_equipment_id);
          if (!newEquipId) continue;

          const { id: _id, created_at: _ca, updated_at: _ua, custom_equipment_id: _ceid, weapon_group_id: _wgid, ...profileData } = profile;

          await supabase
            .from('custom_weapon_profiles')
            .insert({
              ...profileData,
              custom_equipment_id: newEquipId,
              weapon_group_id: customEquipmentIdMap.get(profile.weapon_group_id) || null,
              user_id: targetUserId,
            });
        }
      }
    }

    // Step E: Duplicate fighter_type_skill_access
    const { data: allSkillAccess } = await supabase
      .from('fighter_type_skill_access')
      .select('*')
      .in('custom_fighter_type_id', oldCustomFighterTypeIds);

    if (allSkillAccess && allSkillAccess.length > 0) {
      const skillAccessInserts = allSkillAccess.map(sa => ({
        custom_fighter_type_id: customFighterTypeIdMap.get(sa.custom_fighter_type_id) || null,
        fighter_type_id: sa.fighter_type_id,
        skill_type_id: sa.skill_type_id,
        custom_skill_type_id: sa.custom_skill_type_id
          ? (customSkillTypeIdMap.get(sa.custom_skill_type_id) || sa.custom_skill_type_id)
          : null,
        access_level: sa.access_level,
      }));

      const { error: saInsertError } = await supabase
        .from('fighter_type_skill_access')
        .insert(skillAccessInserts);

      if (saInsertError) {
        throw new Error(`Failed to duplicate skill access: ${saInsertError.message}`);
      }
    }

    // Step F: Duplicate fighter_defaults
    const { data: allDefaults } = await supabase
      .from('fighter_defaults')
      .select('*')
      .in('custom_fighter_type_id', oldCustomFighterTypeIds);

    if (allDefaults && allDefaults.length > 0) {
      const defaultInserts = allDefaults.map(fd => ({
        custom_fighter_type_id: customFighterTypeIdMap.get(fd.custom_fighter_type_id) || null,
        fighter_type_id: fd.fighter_type_id,
        skill_id: fd.skill_id,
        equipment_id: fd.equipment_id,
        custom_equipment_id: fd.custom_equipment_id
          ? (customEquipmentIdMap.get(fd.custom_equipment_id) || fd.custom_equipment_id)
          : null,
      }));

      const { error: fdInsertError } = await supabase
        .from('fighter_defaults')
        .insert(defaultInserts);

      if (fdInsertError) {
        throw new Error(`Failed to duplicate fighter defaults: ${fdInsertError.message}`);
      }
    }
  }

  return {
    newCustomGangTypeId,
    customFighterTypeIdMap,
    customSkillIdMap,
  };
}
