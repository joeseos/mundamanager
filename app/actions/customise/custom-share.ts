'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

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
 * Share a custom gang type to selected campaigns.
 * Cascades: also shares all custom_fighter_types belonging to this gang type,
 * and their custom skills.
 */
export async function shareCustomGangType(customGangTypeId: string, campaignIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify the custom gang type belongs to the user
    const { data: customGangType, error: gangTypeError } = await supabase
      .from('custom_gang_types')
      .select('id, user_id')
      .eq('id', customGangTypeId)
      .eq('user_id', user.id)
      .single();

    if (gangTypeError || !customGangType) {
      return { success: false, error: 'Custom gang type not found or not owned by user' };
    }

    // Delete existing shares for this gang type
    const { error: deleteError } = await supabase
      .from('custom_shared')
      .delete()
      .eq('custom_gang_type_id', customGangTypeId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting existing gang type shares:', deleteError);
      return { success: false, error: `Failed to update shares: ${deleteError.message}` };
    }

    // Insert new shares if any campaigns selected
    if (campaignIds.length > 0) {
      const shareRows = campaignIds.map(campaignId => ({
        custom_gang_type_id: customGangTypeId,
        campaign_id: campaignId,
        user_id: user.id
      }));

      const { error: insertError } = await supabase
        .from('custom_shared')
        .insert(shareRows);

      if (insertError) {
        console.error('Error inserting gang type shares:', insertError);
        return { success: false, error: `Failed to share gang type: ${insertError.message}` };
      }

      // --- Cascade: share all custom fighters belonging to this gang type ---
      const { data: relatedFighters } = await supabase
        .from('custom_fighter_types')
        .select('id')
        .eq('custom_gang_type_id', customGangTypeId)
        .eq('user_id', user.id);

      const fighterIds = (relatedFighters ?? []).map(f => f.id);

      if (fighterIds.length > 0) {
        // Check which fighter shares already exist
        const { data: existingFighterShares } = await supabase
          .from('custom_shared')
          .select('custom_fighter_type_id, campaign_id')
          .in('campaign_id', campaignIds)
          .eq('user_id', user.id)
          .in('custom_fighter_type_id', fighterIds);

        const alreadySharedFighters = new Set(
          (existingFighterShares ?? []).map(s => `${s.campaign_id}:${s.custom_fighter_type_id}`)
        );

        const newFighterShares = campaignIds.flatMap(campaignId =>
          fighterIds
            .filter(fId => !alreadySharedFighters.has(`${campaignId}:${fId}`))
            .map(fId => ({
              custom_fighter_type_id: fId,
              campaign_id: campaignId,
              user_id: user.id
            }))
        );

        if (newFighterShares.length > 0) {
          const { error: shareFightersError } = await supabase
            .from('custom_shared')
            .insert(newFighterShares);

          if (shareFightersError) {
            console.error('Error auto-sharing custom fighters for gang type:', shareFightersError);
          }
        }

        // --- Cascade: share custom skills referenced by these fighters ---
        const { data: fighterSkillAccess } = await supabase
          .from('fighter_type_skill_access')
          .select('custom_skill_type_id')
          .in('custom_fighter_type_id', fighterIds)
          .not('custom_skill_type_id', 'is', null);

        const customSkillTypeIds = Array.from(new Set(
          (fighterSkillAccess ?? [])
            .map(a => a.custom_skill_type_id)
            .filter(Boolean) as string[]
        ));

        if (customSkillTypeIds.length > 0) {
          const { data: customSkills } = await supabase
            .from('custom_skills')
            .select('id')
            .in('custom_skill_type_id', customSkillTypeIds)
            .eq('user_id', user.id);

          const customSkillIds = (customSkills ?? []).map(s => s.id);

          if (customSkillIds.length > 0) {
            const { data: existingSkillShares } = await supabase
              .from('custom_shared')
              .select('custom_skill_id, campaign_id')
              .in('campaign_id', campaignIds)
              .eq('user_id', user.id)
              .in('custom_skill_id', customSkillIds);

            const alreadySharedSkills = new Set(
              (existingSkillShares ?? []).map(s => `${s.campaign_id}:${s.custom_skill_id}`)
            );

            const newSkillShares = campaignIds.flatMap(campaignId =>
              customSkillIds
                .filter(skillId => !alreadySharedSkills.has(`${campaignId}:${skillId}`))
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
                console.error('Error auto-sharing custom skills for gang type:', shareSkillsError);
              }
            }
          }
        }
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in shareCustomGangType:', error);
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

export async function shareCustomTradingPost(customTradingPostId: string, campaignIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: customTradingPost, error: tpError } = await supabase
      .from('custom_trading_posts')
      .select('id, user_id')
      .eq('id', customTradingPostId)
      .eq('user_id', user.id)
      .single();

    if (tpError || !customTradingPost) {
      return { success: false, error: 'Custom trading post not found or not owned by user' };
    }

    const { data: existingShares } = await supabase
      .from('custom_shared')
      .select('campaign_id')
      .eq('custom_trading_post_id', customTradingPostId)
      .eq('user_id', user.id);

    const oldCampaignIds = (existingShares || []).map(s => s.campaign_id);

    const { error: deleteError } = await supabase
      .from('custom_shared')
      .delete()
      .eq('custom_trading_post_id', customTradingPostId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting existing shares:', deleteError);
      return { success: false, error: `Failed to update shares: ${deleteError.message}` };
    }

    if (campaignIds.length > 0) {
      const shareRows = campaignIds.map(campaignId => ({
        custom_trading_post_id: customTradingPostId,
        campaign_id: campaignId,
        user_id: user.id
      }));

      const { error: insertError } = await supabase
        .from('custom_shared')
        .insert(shareRows);

      if (insertError) {
        console.error('Error inserting shares:', insertError);
        return { success: false, error: `Failed to share trading post: ${insertError.message}` };
      }
    }

    for (const cid of campaignIds) {
      revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(cid));
    }

    const removedCampaignIds = oldCampaignIds.filter(id => !campaignIds.includes(id));
    if (removedCampaignIds.length > 0) {
      const { data: affectedCampaigns } = await supabase
        .from('campaigns')
        .select('id, custom_trading_posts')
        .in('id', removedCampaignIds);

      for (const campaign of affectedCampaigns || []) {
        const currentPosts = (campaign.custom_trading_posts as string[]) || [];
        if (currentPosts.includes(customTradingPostId)) {
          const updated = currentPosts.filter((id: string) => id !== customTradingPostId);
          await supabase
            .from('campaigns')
            .update({ custom_trading_posts: updated })
            .eq('id', campaign.id);
          revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(campaign.id));
        }
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in shareCustomTradingPost:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

type CollectionShareItemColumn =
  | 'custom_equipment_id'
  | 'custom_gang_type_id'
  | 'custom_fighter_type_id'
  | 'custom_skill_id'
  | 'custom_trading_post_id';

interface CollectionShareRow {
  campaign_id: string;
  user_id: string;
  custom_collection_id: string;
  custom_equipment_id?: string;
  custom_gang_type_id?: string;
  custom_fighter_type_id?: string;
  custom_skill_id?: string;
  custom_trading_post_id?: string;
}

/**
 * Share (apply) a whole collection to selected campaigns — the primary collection action.
 * Expands the collection's items into per-item custom_shared rows (tagged with custom_collection_id),
 * cascading gang types -> fighters -> skills (mirroring shareCustomGangType), and syncing
 * campaigns.custom_trading_posts for any collected trading posts. campaignIds should be limited
 * to campaigns the caller arbitrates (enforced by the share modal's userCampaigns list).
 * Passing an empty campaignIds unshares the collection from all campaigns.
 */
export async function shareCollection(collectionId: string, campaignIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: collection, error: collectionError } = await supabase
      .from('custom_collections')
      .select('id, user_id, items')
      .eq('id', collectionId)
      .eq('user_id', user.id)
      .single();

    if (collectionError || !collection) {
      return { success: false, error: 'Collection not found or not owned by user' };
    }

    const items = ((collection.items as { type: string; id: string }[]) || []);
    const equipmentIds = new Set(items.filter(i => i.type === 'equipment').map(i => i.id));
    const gangTypeIds = new Set(items.filter(i => i.type === 'gang_type').map(i => i.id));
    const fighterTypeIds = new Set(items.filter(i => i.type === 'fighter_type').map(i => i.id));
    const skillIds = new Set(items.filter(i => i.type === 'skill').map(i => i.id));
    const tradingPostIds = new Set(items.filter(i => i.type === 'trading_post').map(i => i.id));

    // Cascade: gang types -> their custom fighter types
    if (gangTypeIds.size > 0) {
      const { data: fighters } = await supabase
        .from('custom_fighter_types')
        .select('id')
        .in('custom_gang_type_id', Array.from(gangTypeIds))
        .eq('user_id', user.id);
      (fighters ?? []).forEach(f => fighterTypeIds.add(f.id));
    }

    // Cascade: fighter types -> their custom skills (via custom skill types)
    if (fighterTypeIds.size > 0) {
      const { data: access } = await supabase
        .from('fighter_type_skill_access')
        .select('custom_skill_type_id')
        .in('custom_fighter_type_id', Array.from(fighterTypeIds))
        .not('custom_skill_type_id', 'is', null);

      const skillTypeIds = Array.from(new Set(
        (access ?? []).map(a => a.custom_skill_type_id).filter(Boolean) as string[]
      ));

      if (skillTypeIds.length > 0) {
        const { data: skills } = await supabase
          .from('custom_skills')
          .select('id')
          .in('custom_skill_type_id', skillTypeIds)
          .eq('user_id', user.id);
        (skills ?? []).forEach(s => skillIds.add(s.id));
      }
    }

    // Campaigns this collection previously shared a trading post to (for jsonb cleanup)
    const { data: oldTpShares } = await supabase
      .from('custom_shared')
      .select('campaign_id')
      .eq('custom_collection_id', collectionId)
      .eq('user_id', user.id)
      .not('custom_trading_post_id', 'is', null);
    const oldTpCampaignIds = Array.from(new Set((oldTpShares ?? []).map(s => s.campaign_id)));

    // Replace this collection's tagged shares
    const { error: deleteError } = await supabase
      .from('custom_shared')
      .delete()
      .eq('custom_collection_id', collectionId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting existing collection shares:', deleteError);
      return { success: false, error: `Failed to update shares: ${deleteError.message}` };
    }

    if (campaignIds.length > 0) {
      // Dedup against the user's remaining shares for these campaigns
      const { data: existing } = await supabase
        .from('custom_shared')
        .select('campaign_id, custom_equipment_id, custom_gang_type_id, custom_fighter_type_id, custom_skill_id, custom_trading_post_id')
        .in('campaign_id', campaignIds)
        .eq('user_id', user.id);

      const alreadyShared = new Set(
        (existing ?? []).flatMap(r =>
          (['custom_equipment_id', 'custom_gang_type_id', 'custom_fighter_type_id', 'custom_skill_id', 'custom_trading_post_id'] as CollectionShareItemColumn[])
            .filter(col => r[col])
            .map(col => `${r.campaign_id}:${col}:${r[col]}`)
        )
      );

      const rows: CollectionShareRow[] = [];
      const pushRows = (col: CollectionShareItemColumn, ids: Set<string>) => {
        const idList = Array.from(ids);
        for (const campaignId of campaignIds) {
          for (const id of idList) {
            if (alreadyShared.has(`${campaignId}:${col}:${id}`)) continue;
            rows.push({ [col]: id, campaign_id: campaignId, user_id: user.id, custom_collection_id: collectionId });
          }
        }
      };

      pushRows('custom_equipment_id', equipmentIds);
      pushRows('custom_gang_type_id', gangTypeIds);
      pushRows('custom_fighter_type_id', fighterTypeIds);
      pushRows('custom_skill_id', skillIds);
      pushRows('custom_trading_post_id', tradingPostIds);

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('custom_shared').insert(rows);
        if (insertError) {
          console.error('Error inserting collection shares:', insertError);
          return { success: false, error: `Failed to share collection: ${insertError.message}` };
        }
      }
    }

    // Sync campaigns.custom_trading_posts for collected trading posts
    if (tradingPostIds.size > 0) {
      const tpArray = Array.from(tradingPostIds);

      if (campaignIds.length > 0) {
        const { data: addCampaigns } = await supabase
          .from('campaigns')
          .select('id, custom_trading_posts')
          .in('id', campaignIds);
        for (const c of addCampaigns ?? []) {
          const current = (c.custom_trading_posts as string[]) || [];
          const merged = Array.from(new Set([...current, ...tpArray]));
          if (merged.length !== current.length) {
            await supabase.from('campaigns').update({ custom_trading_posts: merged }).eq('id', c.id);
          }
          revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(c.id));
        }
      }

      const removedCampaignIds = oldTpCampaignIds.filter(id => !campaignIds.includes(id));
      if (removedCampaignIds.length > 0) {
        // A trading post may be linked to a campaign by more than one share source
        // (an individual share, or another collection). This collection's tagged rows were already
        // deleted above, so any remaining custom_shared row means the campaign still
        // needs the TP — only strip it from the jsonb when nothing else links it.
        const { data: stillLinked } = await supabase
          .from('custom_shared')
          .select('campaign_id, custom_trading_post_id')
          .in('campaign_id', removedCampaignIds)
          .in('custom_trading_post_id', tpArray);
        const stillNeeded = new Set(
          (stillLinked ?? []).map(r => `${r.campaign_id}:${r.custom_trading_post_id}`)
        );

        const { data: removeCampaigns } = await supabase
          .from('campaigns')
          .select('id, custom_trading_posts')
          .in('id', removedCampaignIds);
        for (const c of removeCampaigns ?? []) {
          const current = (c.custom_trading_posts as string[]) || [];
          const filtered = current.filter(id => !(tpArray.includes(id) && !stillNeeded.has(`${c.id}:${id}`)));
          if (filtered.length !== current.length) {
            await supabase.from('campaigns').update({ custom_trading_posts: filtered }).eq('id', c.id);
          }
          revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(c.id));
        }
      }
    }

    for (const cid of campaignIds) {
      revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(cid));
    }
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in shareCollection:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
