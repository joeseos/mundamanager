'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath } from 'next/cache';

export type PackItemType = 'equipment' | 'fighter_type' | 'gang_type' | 'skill' | 'trading_post';

export interface PackItem {
  type: PackItemType;
  id: string;
}

export interface CustomPack {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  visibility: 'private' | 'public';
  items: PackItem[];
  created_at: string;
  updated_at?: string | null;
}

export interface CustomPackData {
  name: string;
  description?: string | null;
}

// Maps a pack item type to the custom table that owns it.
const ITEM_TABLE: Record<PackItemType, string> = {
  equipment: 'custom_equipment',
  fighter_type: 'custom_fighter_types',
  gang_type: 'custom_gang_types',
  skill: 'custom_skills',
  trading_post: 'custom_trading_posts',
};

export async function createCustomPack(
  data: CustomPackData
): Promise<{ success: boolean; data?: CustomPack; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: newPack, error } = await supabase
      .from('custom_packs')
      .insert({
        user_id: user.id,
        name: data.name.trimEnd(),
        description: data.description || null,
        items: [],
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating custom pack:', error);
      return { success: false, error: `Failed to create custom pack: ${error.message}` };
    }

    revalidatePath('/');
    return { success: true, data: newPack as CustomPack };
  } catch (error) {
    console.error('Error in createCustomPack:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function updateCustomPack(
  id: string,
  data: CustomPackData
): Promise<{ success: boolean; data?: CustomPack; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: updated, error } = await supabase
      .from('custom_packs')
      .update({
        name: data.name.trimEnd(),
        description: data.description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !updated) {
      console.error('Error updating custom pack:', error);
      return { success: false, error: error?.message || 'Custom pack not found or not owned by user' };
    }

    revalidatePath('/');
    return { success: true, data: updated as CustomPack };
  } catch (error) {
    console.error('Error in updateCustomPack:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function deleteCustomPack(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('custom_packs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting custom pack:', error);
      return { success: false, error: `Failed to delete custom pack: ${error.message}` };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteCustomPack:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

/**
 * Read-modify-write the pack's items jsonb to add an item.
 * Verifies the pack and the item are both owned by the caller. No-op if already present.
 */
export async function addPackItem(
  packId: string,
  type: PackItemType,
  itemId: string
): Promise<{ success: boolean; data?: PackItem[]; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify the pack belongs to the user and load current items
    const { data: pack, error: packError } = await supabase
      .from('custom_packs')
      .select('id, user_id, items')
      .eq('id', packId)
      .eq('user_id', user.id)
      .single();

    if (packError || !pack) {
      return { success: false, error: 'Pack not found or not owned by user' };
    }

    // Verify the item belongs to the user
    const { data: item, error: itemError } = await supabase
      .from(ITEM_TABLE[type])
      .select('id')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single();

    if (itemError || !item) {
      return { success: false, error: 'Item not found or not owned by user' };
    }

    const items = (pack.items as PackItem[]) || [];
    if (items.some(i => i.type === type && i.id === itemId)) {
      return { success: true, data: items }; // already present
    }

    const nextItems = [...items, { type, id: itemId }];
    const { error: updateError } = await supabase
      .from('custom_packs')
      .update({ items: nextItems, updated_at: new Date().toISOString() })
      .eq('id', packId)
      .eq('user_id', user.id);

    if (updateError) {
      return { success: false, error: `Failed to add item to pack: ${updateError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: nextItems };
  } catch (error) {
    console.error('Error in addPackItem:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

/**
 * Read-modify-write the pack's items jsonb to remove an item.
 */
export async function removePackItem(
  packId: string,
  type: PackItemType,
  itemId: string
): Promise<{ success: boolean; data?: PackItem[]; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: pack, error: packError } = await supabase
      .from('custom_packs')
      .select('id, user_id, items')
      .eq('id', packId)
      .eq('user_id', user.id)
      .single();

    if (packError || !pack) {
      return { success: false, error: 'Pack not found or not owned by user' };
    }

    const items = (pack.items as PackItem[]) || [];
    const nextItems = items.filter(i => !(i.type === type && i.id === itemId));

    const { error: updateError } = await supabase
      .from('custom_packs')
      .update({ items: nextItems, updated_at: new Date().toISOString() })
      .eq('id', packId)
      .eq('user_id', user.id);

    if (updateError) {
      return { success: false, error: `Failed to remove item from pack: ${updateError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: nextItems };
  } catch (error) {
    console.error('Error in removePackItem:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

/**
 * Copy a pack (and a self-contained deep clone of all its custom items) into the
 * caller's account, via the atomic copy_custom_pack() RPC. Any viewable pack is copyable.
 */
export async function copyPack(
  packId: string
): Promise<{ success: boolean; newPackId?: string; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data, error } = await supabase.rpc('copy_custom_pack', { p_pack_id: packId });

    if (error) {
      console.error('Error copying pack:', error);
      return { success: false, error: `Failed to copy pack: ${error.message}` };
    }

    revalidatePath('/');
    return { success: true, newPackId: data as string };
  } catch (error) {
    console.error('Error in copyPack:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}
