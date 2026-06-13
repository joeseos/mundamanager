import { createClient } from "@/utils/supabase/server";
import type { CustomPack, PackItem, PackItemType } from "@/app/actions/customise/custom-packs";

export type { CustomPack, PackItem, PackItemType } from "@/app/actions/customise/custom-packs";

export interface ResolvedPackItem extends PackItem {
  name: string;
}

export interface CustomPackWithItems extends CustomPack {
  resolvedItems: ResolvedPackItem[];
}

// Per-type resolution config: which table and name column to read.
const RESOLVE: Record<PackItemType, { table: string; nameColumn: string }> = {
  equipment: { table: 'custom_equipment', nameColumn: 'equipment_name' },
  fighter_type: { table: 'custom_fighter_types', nameColumn: 'fighter_type' },
  gang_type: { table: 'custom_gang_types', nameColumn: 'gang_type' },
  skill: { table: 'custom_skills', nameColumn: 'skill_name' },
  trading_post: { table: 'custom_trading_posts', nameColumn: 'custom_trading_post_name' },
};

/**
 * Fetch a user's packs and resolve each item's display name. Item ids that no
 * longer resolve (e.g. the underlying custom item was deleted) are skipped.
 */
export async function getUserCustomPacks(userId: string): Promise<CustomPackWithItems[]> {
  const supabase = await createClient();

  const { data: packs, error } = await supabase
    .from('custom_packs')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching custom packs:', error);
    throw new Error(`Failed to fetch custom packs: ${error.message}`);
  }

  const typedPacks = (packs || []) as CustomPack[];
  if (typedPacks.length === 0) return [];

  // Collect ids per type across all packs.
  const idsByType: Record<PackItemType, Set<string>> = {
    equipment: new Set(),
    fighter_type: new Set(),
    gang_type: new Set(),
    skill: new Set(),
    trading_post: new Set(),
  };
  for (const pack of typedPacks) {
    for (const item of (pack.items || [])) {
      if (idsByType[item.type]) idsByType[item.type].add(item.id);
    }
  }

  // Resolve names per type in one query each.
  const nameMaps: Record<PackItemType, Map<string, string>> = {
    equipment: new Map(),
    fighter_type: new Map(),
    gang_type: new Map(),
    skill: new Map(),
    trading_post: new Map(),
  };

  await Promise.all(
    (Object.keys(RESOLVE) as PackItemType[]).map(async (type) => {
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

  return typedPacks.map(pack => ({
    ...pack,
    resolvedItems: (pack.items || [])
      .map(item => {
        const name = nameMaps[item.type]?.get(item.id);
        return name ? { ...item, name } : null;
      })
      .filter((i): i is ResolvedPackItem => i !== null),
  }));
}
