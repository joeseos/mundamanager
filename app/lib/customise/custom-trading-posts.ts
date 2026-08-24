import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { CustomTradingPost } from "@/app/actions/customise/custom-trading-posts";
import { withEditionSlug } from "@/types/edition";
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getUserCustomTradingPosts(userId: string, supabase: SupabaseClient): Promise<CustomTradingPost[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('custom_trading_posts')
        .select('*, editions:edition_id (slug)')
        .eq('user_id', userId)
        .order('custom_trading_post_name', { ascending: true });

      if (error) {
        console.error('Error fetching custom trading posts:', error);
        throw new Error(`Failed to fetch custom trading posts: ${error.message}`);
      }

      return (data || []).map(withEditionSlug);
    },
    [`user-custom-trading-posts-v3-${userId}`],
    {
      tags: [TAGS.customs(userId)],
      revalidate: false,
    }
  )();
}
