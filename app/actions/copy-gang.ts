'use server'

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { invalidateGangCreation } from '@/utils/cache-tags';
import { revalidatePath } from 'next/cache';

interface CopyGangInput {
  sourceGangId: string;
  newName: string;
}

interface CopyGangResult {
  success: boolean;
  newGangId?: string;
  error?: string;
}

export async function copyGang(params: CopyGangInput): Promise<CopyGangResult> {
  const supabase = await createClient();

  try {
    const user = await getAuthenticatedUser(supabase);

    // 1) Load source gang
    const { data: sourceGang, error: sourceGangError } = await supabase
      .from('gangs')
      .select('*')
      .eq('id', params.sourceGangId)
      .single();

    if (sourceGangError || !sourceGang) {
      throw new Error('Source gang not found');
    }

    // 1.5) Duplicate custom assets if gang uses a custom gang type
    let newCustomGangTypeId: string | null = null;
    const customFighterTypeIdMap = new Map<string, string>();
    const customSkillIdMap = new Map<string, string>();

    if (sourceGang.custom_gang_type_id) {
      // Step A: Duplicate the custom gang type
      const { data: sourceCustomGangType, error: cgtError } = await supabase
        .from('custom_gang_types')
        .select('*')
        .eq('id', sourceGang.custom_gang_type_id)
        .single();

      if (cgtError || !sourceCustomGangType) {
        throw new Error('Source custom gang type not found');
      }

      const { data: newCgt, error: newCgtError } = await supabase
        .from('custom_gang_types')
        .insert({
          user_id: user.id,
          gang_type: sourceCustomGangType.gang_type,
          alignment: sourceCustomGangType.alignment,
          default_image_urls: sourceCustomGangType.default_image_urls,
        })
        .select('id')
        .single();

      if (newCgtError || !newCgt) {
        throw new Error(`Failed to duplicate custom gang type: ${newCgtError?.message}`);
      }

      newCustomGangTypeId = newCgt.id;

      // Step B: Duplicate custom fighter types for this gang type
      const { data: sourceCustomFighters, error: cfError } = await supabase
        .from('custom_fighter_types')
        .select('*')
        .eq('custom_gang_type_id', sourceGang.custom_gang_type_id);

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
              user_id: user.id,
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

      // Step C: Duplicate custom skill types + custom skills
      if (oldCustomFighterTypeIds.length > 0) {
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
          // Duplicate custom skill types
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
                  user_id: user.id,
                })
                .select('id')
                .single();

              if (newStError || !newSt) {
                throw new Error(`Failed to duplicate custom skill type: ${newStError?.message}`);
              }

              customSkillTypeIdMap.set(st.id, newSt.id);
            }
          }

          // Duplicate custom skills belonging to these skill types
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
                  user_id: user.id,
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
                  user_id: user.id,
                })
                .select('id')
                .single();

              if (newCeError || !newCe) {
                throw new Error(`Failed to duplicate custom equipment: ${newCeError?.message}`);
              }

              customEquipmentIdMap.set(ce.id, newCe.id);
            }
          }

          // Duplicate custom weapon profiles for copied equipment
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
                  user_id: user.id,
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
    }

    // 2) Create new gang owned by current user
    const { data: createdGangRows, error: createGangError } = await supabase
      .from('gangs')
      .insert({
        name: params.newName.trimEnd(),
        user_id: user.id,
        gang_type_id: sourceGang.gang_type_id,
        custom_gang_type_id: newCustomGangTypeId || sourceGang.custom_gang_type_id,
        gang_type: sourceGang.gang_type,
        gang_colour: sourceGang.gang_colour,
        alignment: sourceGang.alignment,
        credits: sourceGang.credits,
        reputation: sourceGang.reputation,
        meat: sourceGang.meat,
        scavenging_rolls: sourceGang.scavenging_rolls,
        exploration_points: sourceGang.exploration_points,
        gang_variants: sourceGang.gang_variants,
        note: sourceGang.note,
        note_backstory: sourceGang.note_backstory,
        positioning: null, // Will be updated after fighters are copied
        image_url: sourceGang.image_url || null,
        rating: sourceGang.rating ?? 0,
        gang_origin_id: sourceGang.gang_origin_id,
        gang_affiliation_id: sourceGang.gang_affiliation_id,
        alliance_id: sourceGang.alliance_id,
        power: sourceGang.power,
        sustenance: sourceGang.sustenance,
        salvage: sourceGang.salvage,
        wealth: sourceGang.wealth,
        last_updated: new Date().toISOString(),
      })
      .select()
      .limit(1);

    if (createGangError || !createdGangRows || !createdGangRows[0]) {
      throw new Error(createGangError?.message || 'Failed to create new gang');
    }

    const newGangId: string = createdGangRows[0].id;

    // Helpers to cleanup in case of later failures
    const newFighterIds: string[] = [];
    const newVehicleIds: string[] = [];

    const cleanupOnError = async (err: Error) => {
      try {
        // Clean up any copied images (both gang and fighter images)
        const { data: files } = await supabase.storage
          .from('users-images')
          .list(`gangs/${newGangId}/`);
        
        if (files && files.length > 0) {
          const filesToRemove = files.map(file => `gangs/${newGangId}/${file.name}`);
          await supabase.storage
            .from('users-images')
            .remove(filesToRemove);
        }
      } catch (_) {}
      try {
        // Delete effect modifiers for effects tied to new fighters or vehicles
        const { data: newEffects } = await supabase
          .from('fighter_effects')
          .select('id')
          .or([
            newFighterIds.length ? `fighter_id.in.(${newFighterIds.join(',')})` : '',
            newVehicleIds.length ? `vehicle_id.in.(${newVehicleIds.join(',')})` : ''
          ].filter(Boolean).join(','));
        const effIds = (newEffects || []).map((r: any) => r.id);
        if (effIds.length) {
          await supabase.from('fighter_effect_modifiers').delete().in('fighter_effect_id', effIds);
        }
      } catch (_) {}
      try {
        if (newFighterIds.length) await supabase.from('fighter_effects').delete().in('fighter_id', newFighterIds);
        if (newVehicleIds.length) await supabase.from('fighter_effects').delete().in('vehicle_id', newVehicleIds);
      } catch (_) {}
      try { if (newFighterIds.length) await supabase.from('fighter_skills').delete().in('fighter_id', newFighterIds); } catch (_) {}
      try { if (newFighterIds.length) await supabase.from('fighter_exotic_beasts').delete().in('fighter_pet_id', newFighterIds); } catch (_) {}
      try { await supabase.from('fighter_equipment').delete().eq('gang_id', newGangId); } catch (_) {}
      try { if (newVehicleIds.length) await supabase.from('vehicles').delete().in('id', newVehicleIds); } catch (_) {}
      try { if (newFighterIds.length) await supabase.from('fighters').delete().in('id', newFighterIds); } catch (_) {}
      try { await supabase.from('gangs').delete().eq('id', newGangId); } catch (_) {}
      throw err;
    };

    // 3) Copy fighters
    const { data: sourceFighters, error: fightersError } = await supabase
      .from('fighters')
      .select('*')
      .eq('gang_id', params.sourceGangId);

    if (fightersError) {
      await cleanupOnError(new Error(`Failed to load source fighters: ${fightersError.message}`));
    }

    const fighterIdMap = new Map<string, string>(); // old -> new

    if (sourceFighters && sourceFighters.length > 0) {
      for (const f of sourceFighters) {
        const insertObj: any = { ...f };
        delete insertObj.id;
        insertObj.gang_id = newGangId;
        insertObj.user_id = user.id;
        insertObj.fighter_pet_id = null; // Will be set after copying fighter_exotic_beasts
        // Do not set last_updated; let DB defaults handle timestamps
        // Remap custom_fighter_type_id to the duplicated custom fighter type
        if (insertObj.custom_fighter_type_id && customFighterTypeIdMap.has(insertObj.custom_fighter_type_id)) {
          insertObj.custom_fighter_type_id = customFighterTypeIdMap.get(insertObj.custom_fighter_type_id);
        }

        const { data: newFighter, error: insertFighterError } = await supabase
          .from('fighters')
          .insert(insertObj)
          .select()
          .single();

        if (insertFighterError || !newFighter) {
          await cleanupOnError(new Error(`Failed to insert fighter: ${insertFighterError?.message}`));
        }

        fighterIdMap.set(f.id, newFighter!.id);
        newFighterIds.push(newFighter!.id);
      }
    }

    // 4) Copy vehicles
    const { data: sourceVehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('gang_id', params.sourceGangId);

    if (vehiclesError) {
      await cleanupOnError(new Error(`Failed to load source vehicles: ${vehiclesError.message}`));
    }

    const vehicleIdMap = new Map<string, string>();

    if (sourceVehicles && sourceVehicles.length > 0) {
      for (const v of sourceVehicles) {
        const insertObj: any = { ...v };
        delete insertObj.id;
        insertObj.gang_id = newGangId;
        insertObj.fighter_id = v.fighter_id ? fighterIdMap.get(v.fighter_id) || null : null;

        const { data: newVehicle, error: insertVehicleError } = await supabase
          .from('vehicles')
          .insert(insertObj)
          .select()
          .single();

        if (insertVehicleError || !newVehicle) {
          await cleanupOnError(new Error(`Failed to insert vehicle: ${insertVehicleError?.message}`));
        }

        vehicleIdMap.set(v.id, newVehicle!.id);
        newVehicleIds.push(newVehicle!.id);
      }
    }

    // 5) Copy stash items (gang-level equipment)
    const { data: stashEquipment, error: stashError } = await supabase
      .from('fighter_equipment')
      .select('*')
      .eq('gang_id', params.sourceGangId)
      .eq('gang_stash', true);

    if (stashError) {
      await cleanupOnError(new Error(`Failed to load stash items: ${stashError.message}`));
    }

    const equipmentIdMap = new Map<string, string>();

    if (stashEquipment && stashEquipment.length > 0) {
      for (const item of stashEquipment) {
        const o: any = { ...item };
        delete o.id;
        o.gang_id = newGangId;
        o.user_id = user.id;
        o.fighter_id = null;
        o.vehicle_id = null;
        o.gang_stash = true;

        const { data: inserted, error: stashInsertError } = await supabase
          .from('fighter_equipment')
          .insert(o)
          .select('id')
          .single();

        if (stashInsertError) {
          await cleanupOnError(new Error(`Failed to insert stash item: ${stashInsertError.message}`));
        }
        if (inserted) {
          equipmentIdMap.set(item.id, inserted.id);
        }
      }
    }

    // 6) Copy fighter equipment (build equipment ID map for effect FK remapping)
    const oldFighterIds = Array.from(fighterIdMap.keys());
    if (oldFighterIds.length > 0) {
      const { data: fighterEquip, error: feError } = await supabase
        .from('fighter_equipment')
        .select('*')
        .in('fighter_id', oldFighterIds);
      if (feError) {
        await cleanupOnError(new Error(`Failed to load fighter equipment: ${feError.message}`));
      }
      if (fighterEquip && fighterEquip.length > 0) {
        for (const item of fighterEquip) {
          const o: any = { ...item };
          delete o.id;
          o.gang_id = newGangId;
          o.user_id = user.id;
          o.fighter_id = fighterIdMap.get(item.fighter_id) || null;
          o.vehicle_id = null;
          o.gang_stash = false;
          const { data: inserted, error: feInsertError } = await supabase
            .from('fighter_equipment')
            .insert(o)
            .select('id')
            .single();
          if (feInsertError) {
            await cleanupOnError(new Error(`Failed to insert fighter equipment: ${feInsertError.message}`));
          }
          if (inserted) {
            equipmentIdMap.set(item.id, inserted.id);
          }
        }
      }
    }

    // 7) Copy vehicle equipment (extend equipment ID map)
    const oldVehicleIds = Array.from(vehicleIdMap.keys());
    if (oldVehicleIds.length > 0) {
      const { data: vehicleEquip, error: veError } = await supabase
        .from('fighter_equipment')
        .select('*')
        .in('vehicle_id', oldVehicleIds);
      if (veError) {
        await cleanupOnError(new Error(`Failed to load vehicle equipment: ${veError.message}`));
      }
      if (vehicleEquip && vehicleEquip.length > 0) {
        for (const item of vehicleEquip) {
          const o: any = { ...item };
          delete o.id;
          o.gang_id = newGangId;
          o.user_id = user.id;
          o.fighter_id = null;
          o.vehicle_id = vehicleIdMap.get(item.vehicle_id) || null;
          o.gang_stash = false;
          const { data: inserted, error: veInsertError } = await supabase
            .from('fighter_equipment')
            .insert(o)
            .select('id')
            .single();
          if (veInsertError) {
            await cleanupOnError(new Error(`Failed to insert vehicle equipment: ${veInsertError.message}`));
          }
          if (inserted) {
            equipmentIdMap.set(item.id, inserted.id);
          }
        }
      }
    }

    // 7.5) Copy fighter_exotic_beasts rows and link copied beast fighters
    if (oldFighterIds.length > 0) {
      const { data: sourceBeastRecords, error: beastLoadError } = await supabase
        .from('fighter_exotic_beasts')
        .select('*')
        .in('fighter_pet_id', oldFighterIds);

      if (beastLoadError) {
        await cleanupOnError(new Error(`Failed to load beast records: ${beastLoadError.message}`));
      }

      if (sourceBeastRecords && sourceBeastRecords.length > 0) {
        for (const record of sourceBeastRecords) {
          const newPetId = fighterIdMap.get(record.fighter_pet_id);
          const newOwnerId = record.fighter_owner_id ? fighterIdMap.get(record.fighter_owner_id) : null;
          const newEquipmentId = record.fighter_equipment_id ? equipmentIdMap.get(record.fighter_equipment_id) : null;

          if (!newPetId) continue; // Beast fighter wasn't copied

          const { data: newRecord, error: beastInsertError } = await supabase
            .from('fighter_exotic_beasts')
            .insert({
              fighter_owner_id: newOwnerId || null,
              fighter_pet_id: newPetId,
              fighter_equipment_id: newEquipmentId || null,
            })
            .select('id')
            .single();

          if (beastInsertError || !newRecord) {
            await cleanupOnError(new Error(`Failed to copy beast ownership: ${beastInsertError?.message}`));
          }

          // Link the copied beast fighter to its new ownership record
          const { error: linkError } = await supabase
            .from('fighters')
            .update({ fighter_pet_id: newRecord!.id })
            .eq('id', newPetId);

          if (linkError) {
            await cleanupOnError(new Error(`Failed to link copied beast: ${linkError.message}`));
          }
        }
      }
    }

    // 8) Copy fighter skills
    const skillIdMap = new Map<string, string>();
    if (oldFighterIds.length > 0) {
      const { data: skills, error: skillsError } = await supabase
        .from('fighter_skills')
        .select('*')
        .in('fighter_id', oldFighterIds);
      if (skillsError) {
        await cleanupOnError(new Error(`Failed to load fighter skills: ${skillsError.message}`));
      }
      if (skills && skills.length > 0) {
        const inserts = skills.map((item: any) => {
          const o: any = { ...item };
          delete o.id;
          // no gang_id column on fighter_skills
          o.user_id = user.id;
          o.fighter_id = fighterIdMap.get(item.fighter_id) || null;
          // Remap custom_skill_id to the duplicated custom skill
          if (o.custom_skill_id && customSkillIdMap.has(o.custom_skill_id)) {
            o.custom_skill_id = customSkillIdMap.get(o.custom_skill_id);
          }
          return o;
        });
        const { data: insertedSkills, error: insertSkillsError } = await supabase
          .from('fighter_skills')
          .insert(inserts)
          .select('id');
        if (insertSkillsError) {
          await cleanupOnError(new Error(`Failed to insert fighter skills: ${insertSkillsError.message}`));
        }
        skills.forEach((item: any, i: number) => {
          if (insertedSkills?.[i]?.id) skillIdMap.set(item.id, insertedSkills[i].id);
        });
      }
    }

    // 8.5) Update positioning to use new fighter IDs
    if (sourceGang.positioning && typeof sourceGang.positioning === 'object') {
      const updatedPositioning: Record<string, string> = {};

      for (const [positionSlot, oldFighterId] of Object.entries(sourceGang.positioning)) {
        if (typeof oldFighterId === 'string') {
          const newFighterId = fighterIdMap.get(oldFighterId);
          if (newFighterId) {
            updatedPositioning[positionSlot] = newFighterId;
          }
          // Position slot omitted if fighter wasn't copied
        }
      }

      // Update with new positioning or keep null if no valid fighters
      const { error: updatePositioningError } = await supabase
        .from('gangs')
        .update({
          positioning: Object.keys(updatedPositioning).length > 0 ? updatedPositioning : null
        })
        .eq('id', newGangId);

      if (updatePositioningError) {
        await cleanupOnError(new Error(`Failed to update gang positioning: ${updatePositioningError.message}`));
      }
    }

    // 9) Copy effects (fighters and vehicles) and their modifiers
    // Load effects
    const effectWhereParts: string[] = [];
    if (oldFighterIds.length > 0) effectWhereParts.push(`fighter_id.in.(${oldFighterIds.join(',')})`);
    if (oldVehicleIds.length > 0) effectWhereParts.push(`vehicle_id.in.(${oldVehicleIds.join(',')})`);

    let sourceEffects: any[] = [];
    if (effectWhereParts.length > 0) {
      const { data: effects, error: effectsError } = await supabase
        .from('fighter_effects')
        .select('*')
        .or(effectWhereParts.join(','));
      if (effectsError) {
        await cleanupOnError(new Error(`Failed to load effects: ${effectsError.message}`));
      }
      sourceEffects = effects || [];
    }

    const effectIdMap = new Map<string, string>();

    for (const eff of sourceEffects) {
      const insertObj: any = { ...eff };
      delete insertObj.id;
      // no gang_id column on fighter_effects
      insertObj.user_id = user.id;
      insertObj.fighter_id = eff.fighter_id ? (fighterIdMap.get(eff.fighter_id) || null) : null;
      insertObj.vehicle_id = eff.vehicle_id ? (vehicleIdMap.get(eff.vehicle_id) || null) : null;
      // Remap equipment FKs to new equipment IDs
      if (eff.fighter_equipment_id) {
        const mapped = equipmentIdMap.get(eff.fighter_equipment_id);
        if (!mapped) {
          console.warn(`Equipment ID remap miss: fighter_equipment_id ${eff.fighter_equipment_id} not found in map`);
        }
        insertObj.fighter_equipment_id = mapped || null;
      } else {
        insertObj.fighter_equipment_id = null;
      }
      if (eff.target_equipment_id) {
        const mapped = equipmentIdMap.get(eff.target_equipment_id);
        if (!mapped) {
          console.warn(`Equipment ID remap miss: target_equipment_id ${eff.target_equipment_id} not found in map`);
        }
        insertObj.target_equipment_id = mapped || null;
      } else {
        insertObj.target_equipment_id = null;
      }
      if (eff.fighter_skill_id) {
        const mapped = skillIdMap.get(eff.fighter_skill_id);
        if (!mapped) {
          console.warn(`Skill ID remap miss: fighter_skill_id ${eff.fighter_skill_id} not found in map`);
        }
        insertObj.fighter_skill_id = mapped || null;
      } else {
        insertObj.fighter_skill_id = null;
      }

      const { data: newEff, error: insertEffError } = await supabase
        .from('fighter_effects')
        .insert(insertObj)
        .select()
        .single();

      if (insertEffError || !newEff) {
        await cleanupOnError(new Error(`Failed to insert fighter effect: ${insertEffError?.message}`));
      }

      effectIdMap.set(eff.id, newEff!.id);
    }

    if (sourceEffects.length > 0) {
      const { data: effectModifiers, error: modError } = await supabase
        .from('fighter_effect_modifiers')
        .select('*')
        .in('fighter_effect_id', sourceEffects.map((e: any) => e.id));
      if (modError) {
        await cleanupOnError(new Error(`Failed to load effect modifiers: ${modError.message}`));
      }
      if (effectModifiers && effectModifiers.length > 0) {
        const inserts = effectModifiers.map((m: any) => {
          const o: any = { ...m };
          delete o.id;
          o.fighter_effect_id = effectIdMap.get(m.fighter_effect_id) || null;
          return o;
        });
        const { error: insertModsError } = await supabase
          .from('fighter_effect_modifiers')
          .insert(inserts);
        if (insertModsError) {
          await cleanupOnError(new Error(`Failed to insert effect modifiers: ${insertModsError.message}`));
        }
      }
    }

    // 10) Copy gang image
    try {
      // Check if source gang has a custom image
      if (sourceGang.image_url && sourceGang.image_url.includes('users-images')) {
        // Extract the filename from the source gang's image URL
        const urlParts = sourceGang.image_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        
        if (fileName && (fileName.startsWith(`${params.sourceGangId}_`) || fileName === `${params.sourceGangId}.webp`)) {
          try {
            // Download the source gang image
            const { data: imageData, error: downloadError } = await supabase.storage
              .from('users-images')
              .download(`gangs/${params.sourceGangId}/${fileName}`);
            
            if (downloadError || !imageData) {
              console.warn(`Failed to download gang image ${fileName}:`, downloadError);
            } else {
              // Upload to the new gang's location
              const { error: uploadError } = await supabase.storage
                .from('users-images')
                .upload(`gangs/${newGangId}/${fileName}`, imageData, {
                  contentType: 'image/webp',
                  cacheControl: 'no-cache'
                });

              if (uploadError) {
                console.warn(`Failed to upload gang image ${fileName} to new gang:`, uploadError);
              }
            }
          } catch (imageError) {
            console.warn(`Error copying gang image ${fileName}:`, imageError);
          }
        }
      }
    } catch (storageError) {
      // Log the error but don't fail the gang copy
      console.error('Error copying gang image:', storageError);
    }

    // 11) Copy fighter images
    try {
      // List all fighter images from the source gang
      const { data: sourceFiles } = await supabase.storage
        .from('users-images')
        .list(`gangs/${params.sourceGangId}/fighters/`);
      
      if (sourceFiles && sourceFiles.length > 0) {
        for (const file of sourceFiles) {
          try {
            // Download the source image
            const { data: imageData, error: downloadError } = await supabase.storage
              .from('users-images')
              .download(`gangs/${params.sourceGangId}/fighters/${file.name}`);
            
            if (downloadError || !imageData) {
              console.warn(`Failed to download image ${file.name}:`, downloadError);
              continue;
            }

            // Upload to the new gang's location
            const { error: uploadError } = await supabase.storage
              .from('users-images')
              .upload(`gangs/${newGangId}/fighters/${file.name}`, imageData, {
                contentType: 'image/webp',
                cacheControl: 'no-cache'
              });

            if (uploadError) {
              console.warn(`Failed to upload image ${file.name} to new gang:`, uploadError);
            }
          } catch (imageError) {
            console.warn(`Error copying image ${file.name}:`, imageError);
          }
        }
      }
    } catch (storageError) {
      // Log the error but don't fail the gang copy
      console.error('Error copying fighter images:', storageError);
    }

    // 12) Invalidate caches for the new gang
    invalidateGangCreation({ gangId: newGangId, userId: user.id });

    // Invalidate home page so custom assets tab shows duplicated assets
    if (newCustomGangTypeId) {
      revalidatePath('/');
    }

    return { success: true, newGangId };
  } catch (error) {
    console.error('Error in copyGang server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 