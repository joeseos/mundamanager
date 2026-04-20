'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath } from 'next/cache';

export interface CustomGangTypeData {
  gang_type: string;
  alignment?: 'Outlaw' | 'Law Abiding' | 'Unaligned' | null;
}

const DEFAULT_TRADING_POST_TYPE_ID = 'cada4005-66e3-4e3c-8a77-146329bd1eda';

export interface CustomGangType {
  id: string;
  user_id: string;
  gang_type: string;
  alignment?: string | null;
  trading_post_type_id?: string | null;
  default_image_urls?: any | null;
  created_at: string;
  updated_at?: string | null;
  // Joined data
  trading_post_type_name?: string | null;
}

export async function createCustomGangType(
  data: CustomGangTypeData
): Promise<{ success: boolean; data?: CustomGangType; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: newGangType, error: insertError } = await supabase
      .from('custom_gang_types')
      .insert({
        user_id: user.id,
        gang_type: data.gang_type.trimEnd(),
        alignment: data.alignment || null,
        trading_post_type_id: DEFAULT_TRADING_POST_TYPE_ID,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating custom gang type:', insertError);
      return { success: false, error: `Failed to create custom gang type: ${insertError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: newGangType };
  } catch (error) {
    console.error('Error in createCustomGangType:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function updateCustomGangType(
  id: string,
  data: CustomGangTypeData
): Promise<{ success: boolean; data?: CustomGangType; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('custom_gang_types')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: 'Custom gang type not found or not owned by user' };
    }

    const { data: updated, error: updateError } = await supabase
      .from('custom_gang_types')
      .update({
        gang_type: data.gang_type.trimEnd(),
        alignment: data.alignment || null,
        trading_post_type_id: DEFAULT_TRADING_POST_TYPE_ID,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating custom gang type:', updateError);
      return { success: false, error: `Failed to update custom gang type: ${updateError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error in updateCustomGangType:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function deleteCustomGangType(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('custom_gang_types')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: 'Custom gang type not found or not owned by user' };
    }

    // Delete the custom gang type (cascades to gangs and custom_shared)
    const { error: deleteError } = await supabase
      .from('custom_gang_types')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting custom gang type:', deleteError);
      return { success: false, error: `Failed to delete custom gang type: ${deleteError.message}` };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteCustomGangType:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
