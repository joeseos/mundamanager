'use server';

import { invalidateUserCustoms } from '@/utils/cache-tags';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CollectionItemType = 'equipment' | 'fighter_type' | 'gang_type' | 'skill' | 'trading_post';

export interface CollectionItem {
  type: CollectionItemType;
  id: string;
}

export interface CustomCollection {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  items: CollectionItem[];
  created_at: string;
  updated_at?: string | null;
}

export interface CustomCollectionData {
  name: string;
  description?: string | null;
}

// Maps a collection item type to the custom table that owns it.
const ITEM_TABLE: Record<CollectionItemType, string> = {
  equipment: 'custom_equipment',
  fighter_type: 'custom_fighter_types',
  gang_type: 'custom_gang_types',
  skill: 'custom_skills',
  trading_post: 'custom_trading_posts',
};

export async function removeItemFromAllCollections(
  supabase: SupabaseClient,
  userId: string,
  removals: { type: CollectionItemType; id: string }[]
): Promise<void> {
  try {
    const { data: collections } = await supabase
      .from('custom_collections')
      .select('id, items')
      .eq('user_id', userId);

    if (!collections?.length) return;

    const removalSet = new Set(removals.map(r => `${r.type}:${r.id}`));

    for (const col of collections) {
      const items = (col.items as CollectionItem[]) || [];
      const filtered = items.filter(i => !removalSet.has(`${i.type}:${i.id}`));
      if (filtered.length < items.length) {
        await supabase
          .from('custom_collections')
          .update({ items: filtered, updated_at: new Date().toISOString() })
          .eq('id', col.id);
      }
    }
  } catch (error) {
    console.error('Error removing items from collections:', error);
  }
}

export async function createCustomCollection(
  data: CustomCollectionData
): Promise<{ success: boolean; data?: CustomCollection; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: newCollection, error } = await supabase
      .from('custom_collections')
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
      console.error('Error creating custom collection:', error);
      return { success: false, error: `Failed to create custom collection: ${error.message}` };
    }

    invalidateUserCustoms(user.id);
    return { success: true, data: newCollection as CustomCollection };
  } catch (error) {
    console.error('Error in createCustomCollection:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function updateCustomCollection(
  id: string,
  data: CustomCollectionData
): Promise<{ success: boolean; data?: CustomCollection; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: updated, error } = await supabase
      .from('custom_collections')
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
      console.error('Error updating custom collection:', error);
      return { success: false, error: error?.message || 'Custom collection not found or not owned by user' };
    }

    invalidateUserCustoms(user.id);
    return { success: true, data: updated as CustomCollection };
  } catch (error) {
    console.error('Error in updateCustomCollection:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function deleteCustomCollection(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('custom_collections')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting custom collection:', error);
      return { success: false, error: `Failed to delete custom collection: ${error.message}` };
    }

    invalidateUserCustoms(user.id);
    return { success: true };
  } catch (error) {
    console.error('Error in deleteCustomCollection:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

/**
 * Read-modify-write the collection's items jsonb to add an item.
 * Verifies the collection and the item are both owned by the caller. No-op if already present.
 */
export async function addCollectionItem(
  collectionId: string,
  type: CollectionItemType,
  itemId: string
): Promise<{ success: boolean; data?: CollectionItem[]; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify the collection belongs to the user and load current items
    const { data: collection, error: collectionError } = await supabase
      .from('custom_collections')
      .select('id, user_id, items')
      .eq('id', collectionId)
      .eq('user_id', user.id)
      .single();

    if (collectionError || !collection) {
      return { success: false, error: 'Collection not found or not owned by user' };
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

    const items = (collection.items as CollectionItem[]) || [];
    if (items.some(i => i.type === type && i.id === itemId)) {
      return { success: true, data: items }; // already present
    }

    const nextItems = [...items, { type, id: itemId }];
    const { error: updateError } = await supabase
      .from('custom_collections')
      .update({ items: nextItems, updated_at: new Date().toISOString() })
      .eq('id', collectionId)
      .eq('user_id', user.id);

    if (updateError) {
      return { success: false, error: `Failed to add item to collection: ${updateError.message}` };
    }

    invalidateUserCustoms(user.id);
    return { success: true, data: nextItems };
  } catch (error) {
    console.error('Error in addCollectionItem:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

/**
 * Read-modify-write the collection's items jsonb to remove an item.
 */
export async function removeCollectionItem(
  collectionId: string,
  type: CollectionItemType,
  itemId: string
): Promise<{ success: boolean; data?: CollectionItem[]; error?: string }> {
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

    const items = (collection.items as CollectionItem[]) || [];
    const nextItems = items.filter(i => !(i.type === type && i.id === itemId));

    const { error: updateError } = await supabase
      .from('custom_collections')
      .update({ items: nextItems, updated_at: new Date().toISOString() })
      .eq('id', collectionId)
      .eq('user_id', user.id);

    if (updateError) {
      return { success: false, error: `Failed to remove item from collection: ${updateError.message}` };
    }

    invalidateUserCustoms(user.id);
    return { success: true, data: nextItems };
  } catch (error) {
    console.error('Error in removeCollectionItem:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

/**
 * Copy a collection (and a self-contained deep clone of all its custom items) into the
 * caller's account, via the atomic copy_custom_collection() RPC. Any viewable collection is copyable.
 */
export async function copyCollection(
  collectionId: string,
  name: string
): Promise<{ success: boolean; newCollectionId?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data, error } = await supabase.rpc('copy_custom_collection', { p_collection_id: collectionId, p_name: name.trimEnd() });

    if (error) {
      console.error('Error copying collection:', error);
      return { success: false, error: `Failed to copy collection: ${error.message}` };
    }

    invalidateUserCustoms(user.id);
    return { success: true, newCollectionId: data as string };
  } catch (error) {
    console.error('Error in copyCollection:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}
