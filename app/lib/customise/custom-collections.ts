import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { inArray } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import { customEquipment, customFighterTypes, customGangTypes, customSkills, customTradingPosts } from '@/utils/db/schema';
import { withEditionSlug } from "@/types/edition";
import type { CustomCollection, CollectionItem, CollectionItemType } from "@/app/actions/customise/custom-collections";
import { CUSTOM_ROW } from './custom-row';

export type { CustomCollection, CollectionItem, CollectionItemType } from "@/app/actions/customise/custom-collections";

export interface ResolvedCollectionItem extends CollectionItem {
  name: string;
}

export interface CustomCollectionWithItems extends CustomCollection {
  resolvedItems: ResolvedCollectionItem[];
}

// Per-type resolution config: which table and name column to read.
const RESOLVE = {
  equipment: { table: customEquipment, name: customEquipment.equipment_name },
  fighter_type: { table: customFighterTypes, name: customFighterTypes.fighter_type },
  gang_type: { table: customGangTypes, name: customGangTypes.gang_type },
  skill: { table: customSkills, name: customSkills.skill_name },
  trading_post: { table: customTradingPosts, name: customTradingPosts.custom_trading_post_name },
} satisfies Record<CollectionItemType, unknown>;

const itemKey = (item: CollectionItem) => `${item.type}:${item.id}`;

/**
 * Fetch a user's collections and resolve each item's display name. Item ids that no
 * longer resolve (e.g. the underlying custom item was deleted) are skipped.
 */
export async function getUserCustomCollections(userId: string): Promise<CustomCollectionWithItems[]> {
  return unstable_cache(
    async () => {
      const db = getAppDb();
      const collections = await db.query.customCollections.findMany({
        ...CUSTOM_ROW,
        where: (collection, { eq }) => eq(collection.user_id, userId),
        orderBy: (collection, { asc }) => asc(collection.name),
        with: { editions: { columns: { slug: true } } },
      });

      const items = collections.flatMap(collection => collection.items);
      const names = new Map<string, string>();

      // Resolve names per type in one query each.
      await Promise.all(
        (Object.keys(RESOLVE) as CollectionItemType[]).map(async (type) => {
          const ids = [...new Set(items.filter(item => item.type === type).map(item => item.id))];
          if (ids.length === 0) return;
          const { table, name } = RESOLVE[type];
          const rows = await db.select({ id: table.id, name }).from(table).where(inArray(table.id, ids));
          for (const row of rows) {
            if (row.name) names.set(itemKey({ type, id: row.id }), row.name);
          }
        })
      );

      return collections.map(collection => ({
        ...withEditionSlug(collection),
        resolvedItems: collection.items.flatMap(item => {
          const name = names.get(itemKey(item));
          return name ? [{ ...item, name }] : [];
        }),
      }));
    },
    [`user-custom-collections-v3-${userId}`],
    {
      tags: [TAGS.customs(userId)],
      revalidate: false,
    }
  )();
}
