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
    }

    revalidatePath('/customise');
    return { success: true };
  } catch (error) {
    console.error('Error in shareCustomFighter:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
