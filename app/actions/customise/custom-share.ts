'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath } from 'next/cache';

/**
 * Share a custom fighter to selected campaigns
 */
export async function shareCustomFighter(customFighterTypeId: string, campaignIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify the custom fighter belongs to the user
    const { data: customFighter, error: fighterError } = await supabase
      .from('custom_fighter_types')
      .select('id, user_id')
      .eq('id', customFighterTypeId)
      .eq('user_id', user.id)
      .single();

    if (fighterError || !customFighter) {
      return { success: false, error: 'Custom fighter not found or not owned by user' };
    }

    // Delete existing shares for this fighter
    const { error: deleteError } = await supabase
      .from('custom_shared')
      .delete()
      .eq('custom_fighter_type_id', customFighterTypeId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting existing shares:', deleteError);
      return { success: false, error: `Failed to update shares: ${deleteError.message}` };
    }

    // Insert new shares if any campaigns selected
    if (campaignIds.length > 0) {
      const shareRows = campaignIds.map(campaignId => ({
        custom_fighter_type_id: customFighterTypeId,
        campaign_id: campaignId,
        user_id: user.id
      }));

      const { error: insertError } = await supabase
        .from('custom_shared')
        .insert(shareRows);

      if (insertError) {
        console.error('Error inserting shares:', insertError);
        return { success: false, error: `Failed to share fighter: ${insertError.message}` };
      }

      // Auto-share custom skill types referenced by this fighter's skill access
      const { data: fighterSkillAccess } = await supabase
        .from('fighter_type_skill_access')
        .select('custom_skill_type_id')
        .eq('custom_fighter_type_id', customFighterTypeId)
        .not('custom_skill_type_id', 'is', null);

      const customSkillTypeIds = (fighterSkillAccess ?? [])
        .map(a => a.custom_skill_type_id)
        .filter(Boolean) as string[];

      if (customSkillTypeIds.length > 0) {
        // Find all custom skills belonging to these custom skill types (owned by user)
        const { data: customSkills } = await supabase
          .from('custom_skills')
          .select('id')
          .in('custom_skill_type_id', customSkillTypeIds)
          .eq('user_id', user.id);

        const customSkillIds = (customSkills ?? []).map(s => s.id);

        if (customSkillIds.length > 0) {
          // Batch check: get all existing shares across all campaigns at once
          const { data: existingShares } = await supabase
            .from('custom_shared')
            .select('custom_skill_id, campaign_id')
            .in('campaign_id', campaignIds)
            .eq('user_id', user.id)
            .in('custom_skill_id', customSkillIds);

          const alreadyShared = new Set(
            (existingShares ?? []).map(s => `${s.campaign_id}:${s.custom_skill_id}`)
          );

          const newSkillShares = campaignIds.flatMap(campaignId =>
            customSkillIds
              .filter(skillId => !alreadyShared.has(`${campaignId}:${skillId}`))
              .map(skillId => ({
                custom_skill_id: skillId,
                campaign_id: campaignId,
                user_id: user.id
              }))
          );

          if (newSkillShares.length > 0) {
            const { error: shareSkillsError } = await supabase
              .from('custom_shared')
              .insert(newSkillShares);

            if (shareSkillsError) {
              console.error('Error auto-sharing custom skills for fighter:', shareSkillsError);
            }
          }
        }
      }
    }

    // Ensure the home page (customise tab) reflects new sharing state
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in shareCustomFighter:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Share custom equipment to selected campaigns
 */
export async function shareCustomEquipment(customEquipmentId: string, campaignIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify the custom equipment belongs to the user
    const { data: customEquipment, error: equipmentError } = await supabase
      .from('custom_equipment')
      .select('id, user_id')
      .eq('id', customEquipmentId)
      .eq('user_id', user.id)
      .single();

    if (equipmentError || !customEquipment) {
      return { success: false, error: 'Custom equipment not found or not owned by user' };
    }

    // Delete existing shares for this equipment
    const { error: deleteError } = await supabase
      .from('custom_shared')
      .delete()
      .eq('custom_equipment_id', customEquipmentId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting existing shares:', deleteError);
      return { success: false, error: `Failed to update shares: ${deleteError.message}` };
    }

    // Insert new shares if any campaigns selected
    if (campaignIds.length > 0) {
      const shareRows = campaignIds.map(campaignId => ({
        custom_equipment_id: customEquipmentId,
        campaign_id: campaignId,
        user_id: user.id
      }));

      const { error: insertError } = await supabase
        .from('custom_shared')
        .insert(shareRows);

      if (insertError) {
        console.error('Error inserting shares:', insertError);
        return { success: false, error: `Failed to share equipment: ${insertError.message}` };
      }
    }

    // Ensure the home page (customise tab) reflects new sharing state
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in shareCustomEquipment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Share a custom skill to selected campaigns
 */
export async function shareCustomSkill(customSkillId: string, campaignIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify the custom skill belongs to the user
    const { data: customSkill, error: skillError } = await supabase
      .from('custom_skills')
      .select('id, user_id')
      .eq('id', customSkillId)
      .eq('user_id', user.id)
      .single();

    if (skillError || !customSkill) {
      return { success: false, error: 'Custom skill not found or not owned by user' };
    }

    // Delete existing shares for this skill
    const { error: deleteError } = await supabase
      .from('custom_shared')
      .delete()
      .eq('custom_skill_id', customSkillId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting existing shares:', deleteError);
      return { success: false, error: `Failed to update shares: ${deleteError.message}` };
    }

    // Insert new shares if any campaigns selected
    if (campaignIds.length > 0) {
      const shareRows = campaignIds.map(campaignId => ({
        custom_skill_id: customSkillId,
        campaign_id: campaignId,
        user_id: user.id
      }));

      const { error: insertError } = await supabase
        .from('custom_shared')
        .insert(shareRows);

      if (insertError) {
        console.error('Error inserting shares:', insertError);
        return { success: false, error: `Failed to share skill: ${insertError.message}` };
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in shareCustomSkill:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
