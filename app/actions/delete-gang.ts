'use server';

import { invalidateCampaignGang, invalidateUser, invalidatePermission, invalidateGangCount } from '@/utils/cache-tags';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { gangImageFolders, removeStorageFolders } from '@/utils/storage-cleanup';

export async function deleteGang(gangId: string) {
  console.log('[deleteGang] Starting:', gangId);

  try {
    const supabase = await createClient();

    // Authenticate user
    await getAuthenticatedUser(supabase);

    // Get gang information to verify ownership
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, user_id')
      .eq('id', gangId)
      .single();

    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    // Fetch campaign associations BEFORE delete (in case of CASCADE)
    const { data: campaigns } = await supabase
      .from('campaign_gangs')
      .select('campaign_id, user_id')
      .eq('gang_id', gangId);

    // Delete the gang
    const { error: deleteError } = await supabase
      .from('gangs')
      .delete()
      .eq('id', gangId);

    // Handle delete error inline - don't throw
    if (deleteError) {
      console.error('[deleteGang] Delete failed:', deleteError);
      return {
        success: false,
        error: deleteError.message || 'Database error during delete'
      };
    }

    await removeStorageFolders(supabase, gangImageFolders(gangId));

    // Invalidate user's gang cache
    invalidateUser(gang.user_id);
    invalidateUser(gang.user_id);

    // Invalidate gang permissions cache
    invalidatePermission(gang.user_id, gangId);
    invalidateUser(gang.user_id);

    // Invalidate campaign membership caches if gang was in any campaigns (fetched before delete)
    if (campaigns && campaigns.length > 0) {
      campaigns.forEach(camp => {
        invalidateCampaignGang(camp.campaign_id, gangId);
        invalidateUser(camp.user_id);
      });
    }

    // Invalidate global gang count
    invalidateGangCount();

    console.log('[deleteGang] Success:', gangId);
    return { success: true };
  } catch (error) {
    console.error('[deleteGang] Caught error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An error occurred'
    };
  }
}
