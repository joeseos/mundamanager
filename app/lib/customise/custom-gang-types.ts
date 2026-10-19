import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { getAppDb } from '@/utils/db/client';
import { CustomGangType } from "@/app/actions/customise/custom-gang-types";
import { withEditionSlug } from "@/types/edition";

export async function getUserCustomGangTypes(userId: string): Promise<CustomGangType[]> {
  return unstable_cache(
    async () => {
      const gangTypes = await getAppDb().query.customGangTypes.findMany({
        columns: { created_at: false, updated_at: false },
        extras: (gangType, { sql }) => ({
          created_at: sql<string>`to_json(${gangType.created_at})`.as('created_at'),
          updated_at: sql<string | null>`to_json(${gangType.updated_at})`.as('updated_at'),
        }),
        where: (gangType, { eq }) => eq(gangType.user_id, userId),
        orderBy: (gangType, { asc }) => asc(gangType.gang_type),
        with: { editions: { columns: { slug: true } } },
      });

      return gangTypes.map(withEditionSlug);
    },
    [`user-custom-gang-types-v3-${userId}`],
    {
      tags: [TAGS.customs(userId)],
      revalidate: false,
    }
  )();
}
