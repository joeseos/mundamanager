import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { getAppDb } from '@/utils/db/client';
import { CustomEquipment } from "@/types/equipment";
import { withEditionSlug } from "@/types/edition";

// Re-export for backward compatibility
export type { CustomEquipment } from "@/types/equipment";

export async function getUserCustomEquipment(userId: string): Promise<CustomEquipment[]> {
  return unstable_cache(
    async () => {
      const customEquipment = await getAppDb().query.customEquipment.findMany({
        columns: { created_at: false, updated_at: false },
        extras: (item, { sql }) => ({
          created_at: sql<string>`to_json(${item.created_at})`.as('created_at'),
          updated_at: sql<string | null>`to_json(${item.updated_at})`.as('updated_at'),
        }),
        where: (item, { eq }) => eq(item.user_id, userId),
        orderBy: (item, { asc }) => asc(item.equipment_name),
        with: { editions: { columns: { slug: true } } },
      });

      return customEquipment.map(withEditionSlug);
    },
    [`user-custom-equipment-v3-${userId}`],
    {
      tags: [TAGS.customs(userId)],
      revalidate: false,
    }
  )();
}
