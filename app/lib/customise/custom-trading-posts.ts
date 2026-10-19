import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { getAppDb } from '@/utils/db/client';
import { CustomTradingPost } from "@/app/actions/customise/custom-trading-posts";
import { withEditionSlug } from "@/types/edition";
import { CUSTOM_ROW } from './custom-row';

export async function getUserCustomTradingPosts(userId: string): Promise<CustomTradingPost[]> {
  return unstable_cache(
    async () => {
      const tradingPosts = await getAppDb().query.customTradingPosts.findMany({
        ...CUSTOM_ROW,
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
