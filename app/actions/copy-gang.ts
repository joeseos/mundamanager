'use server'

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { invalidateGangCreation } from '@/utils/cache-tags';

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

    // 2) Create new gang owned by current user
    const { data: createdGangRows, error: createGangError } = await supabase
      .from('gangs')
      .insert({
        name: params.newName.trimEnd(),
        user_id: user.id,
        gang_type_id: sourceGang.gang_type_id,
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
        // Do not set last_updated; let DB defaults handle timestamps

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

    if (stashEquipment && stashEquipment.length > 0) {
      const inserts = stashEquipment.map((item: any) => {
        const o: any = { ...item };
        delete o.id;
        o.gang_id = newGangId;
        o.user_id = user.id;
        o.fighter_id = null;
        o.vehicle_id = null;
        o.gang_stash = true;
        return o;
      });
      const { error: stashInsertError } = await supabase
        .from('fighter_equipment')
        .insert(inserts);
      if (stashInsertError) {
        await cleanupOnError(new Error(`Failed to insert stash items: ${stashInsertError.message}`));
      }
    }

    // 6) Copy fighter equipment (build equipment ID map for effect FK remapping)
    const equipmentIdMap = new Map<string, string>();
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
        const inserts = fighterEquip.map((item: any) => {
          const o: any = { ...item };
          delete o.id;
          o.gang_id = newGangId;
          o.user_id = user.id;
          o.fighter_id = fighterIdMap.get(item.fighter_id) || null;
          o.vehicle_id = null;
          o.gang_stash = false;
          return o;
        });
        const { data: insertedFighterEquip, error: feInsertError } = await supabase
          .from('fighter_equipment')
          .insert(inserts)
          .select('id');
        if (feInsertError) {
          await cleanupOnError(new Error(`Failed to insert fighter equipment: ${feInsertError.message}`));
        }
        // Build equipment ID map (old → new)
        fighterEquip.forEach((item: any, index: number) => {
          if (insertedFighterEquip?.[index]) {
            equipmentIdMap.set(item.id, insertedFighterEquip[index].id);
          }
        });
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
        const inserts = vehicleEquip.map((item: any) => {
          const o: any = { ...item };
          delete o.id;
          o.gang_id = newGangId;
          o.user_id = user.id;
          o.fighter_id = null;
          o.vehicle_id = vehicleIdMap.get(item.vehicle_id) || null;
          o.gang_stash = false;
          return o;
        });
        const { data: insertedVehicleEquip, error: veInsertError } = await supabase
          .from('fighter_equipment')
          .insert(inserts)
          .select('id');
        if (veInsertError) {
          await cleanupOnError(new Error(`Failed to insert vehicle equipment: ${veInsertError.message}`));
        }
        // Extend equipment ID map (old → new)
        vehicleEquip.forEach((item: any, index: number) => {
          if (insertedVehicleEquip?.[index]) {
            equipmentIdMap.set(item.id, insertedVehicleEquip[index].id);
          }
        });
      }
    }

    // 8) Copy fighter skills
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
          return o;
        });
        const { error: insertSkillsError } = await supabase
          .from('fighter_skills')
          .insert(inserts);
        if (insertSkillsError) {
          await cleanupOnError(new Error(`Failed to insert fighter skills: ${insertSkillsError.message}`));
        }
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
      insertObj.fighter_equipment_id = eff.fighter_equipment_id
        ? (equipmentIdMap.get(eff.fighter_equipment_id) || null)
        : null;
      insertObj.target_equipment_id = eff.target_equipment_id
        ? (equipmentIdMap.get(eff.target_equipment_id) || null)
        : null;

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

    return { success: true, newGangId };
  } catch (error) {
    console.error('Error in copyGang server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 