import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { getAppDb } from '@/utils/db/client';
import { CustomGangType } from "@/app/actions/customise/custom-gang-types";
import { withEditionSlug } from "@/types/edition";
import { CUSTOM_ROW } from './custom-row';

export async function getUserCustomGangTypes(userId: string): Promise<CustomGangType[]> {
  return unstable_cache(
    async () => {
      const gangTypes = await getAppDb().query.customGangTypes.findMany({
        ...CUSTOM_ROW,
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
