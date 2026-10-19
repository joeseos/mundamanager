import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { getAppDb } from '@/utils/db/client';
import { CustomTradingPost } from "@/app/actions/customise/custom-trading-posts";
import { withEditionSlug } from "@/types/edition";

export async function getUserCustomTradingPosts(userId: string): Promise<CustomTradingPost[]> {
  return unstable_cache(
    async () => {
      const tradingPosts = await getAppDb().query.customTradingPosts.findMany({
        columns: { created_at: false, updated_at: false },
        extras: (tradingPost, { sql }) => ({
          created_at: sql<string>`to_json(${tradingPost.created_at})`.as('created_at'),
          updated_at: sql<string | null>`to_json(${tradingPost.updated_at})`.as('updated_at'),
        }),
        where: (tradingPost, { eq }) => eq(tradingPost.user_id, userId),
        orderBy: (tradingPost, { asc }) => asc(tradingPost.custom_trading_post_name),
        with: { editions: { columns: { slug: true } } },
      });

      return tradingPosts.map(withEditionSlug);
    },
    [`user-custom-trading-posts-v3-${userId}`],
    {
      tags: [TAGS.customs(userId)],
      revalidate: false,
    }
  )();
}
