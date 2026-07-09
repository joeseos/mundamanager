import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from "@/utils/cache-tags";
import type { CustomCollection, CollectionItem, CollectionItemType } from "@/app/actions/customise/custom-collections";
import type { SupabaseClient } from '@supabase/supabase-js';

export type { CustomCollection, CollectionItem, CollectionItemType } from "@/app/actions/customise/custom-collections";

export interface ResolvedCollectionItem extends CollectionItem {
  name: string;
}

export interface CustomCollectionWithItems extends CustomCollection {
  resolvedItems: ResolvedCollectionItem[];
}

// Per-type resolution config: which table and name column to read.
const RESOLVE: Record<CollectionItemType, { table: string; nameColumn: string }> = {
  equipment: { table: 'custom_equipment', nameColumn: 'equipment_name' },
  fighter_type: { table: 'custom_fighter_types', nameColumn: 'fighter_type' },
  gang_type: { table: 'custom_gang_types', nameColumn: 'gang_type' },
  skill: { table: 'custom_skills', nameColumn: 'skill_name' },
  trading_post: { table: 'custom_trading_posts', nameColumn: 'custom_trading_post_name' },
};

/**
 * Fetch a user's collections and resolve each item's display name. Item ids that no
 * longer resolve (e.g. the underlying custom item was deleted) are skipped.
 */
export async function getUserCustomCollections(userId: string, supabase: SupabaseClient): Promise<CustomCollectionWithItems[]> {
  return unstable_cache(
    async () => {
      const { data: collections, error } = await supabase
        .from('custom_collections')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching custom collections:', error);
        throw new Error(`Failed to fetch custom collections: ${error.message}`);
      }

      const typedCollections = (collections || []) as CustomCollection[];
      if (typedCollections.length === 0) return [];

      // Collect ids per type across all collections.
      const idsByType: Record<CollectionItemType, Set<string>> = {
        equipment: new Set(),
        fighter_type: new Set(),
        gang_type: new Set(),
        skill: new Set(),
        trading_post: new Set(),
      };
      for (const collection of typedCollections) {
        for (const item of (collection.items || [])) {
          if (idsByType[item.type]) idsByType[item.type].add(item.id);
        }
      }

      // Resolve names per type in one query each.
      const nameMaps: Record<CollectionItemType, Map<string, string>> = {
        equipment: new Map(),
        fighter_type: new Map(),
        gang_type: new Map(),
        skill: new Map(),
        trading_post: new Map(),
      };

      await Promise.all(
        (Object.keys(RESOLVE) as CollectionItemType[]).map(async (type) => {
          const ids = Array.from(idsByType[type]);
          if (ids.length === 0) return;
          const { table, nameColumn } = RESOLVE[type];
          const { data } = await supabase
            .from(table)
            .select(`id, ${nameColumn}`)
            .in('id', ids);
          for (const row of ((data ?? []) as unknown as Record<string, string>[])) {
            nameMaps[type].set(row.id, row[nameColumn]);
          }
        })
      );

      return typedCollections.map(collection => ({
        ...collection,
        resolvedItems: (collection.items || [])
          .map(item => {
            const name = nameMaps[item.type]?.get(item.id);
            return name ? { ...item, name } : null;
          })
          .filter((i): i is ResolvedCollectionItem => i !== null),
      }));
    },
    [`user-custom-collections-v2-${userId}`],
    {
      tags: [CACHE_TAGS.USER_CUSTOM_COLLECTIONS(userId)],
      revalidate: false,
    }
  )();
}
