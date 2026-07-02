import { cacheTag, cacheLife } from 'next/cache';
import { CustomTradingPost } from "@/app/actions/customise/custom-trading-posts";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { createServiceRoleClient } from '@/utils/supabase/server';

export async function getUserCustomTradingPosts(userId: string): Promise<CustomTradingPost[]> {
  'use cache: remote';
  cacheLife('max');
  cacheTag(CACHE_TAGS.USER_CUSTOM_TRADING_POSTS(userId));

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('custom_trading_posts')
    .select('*')
    .eq('user_id', userId)
    .order('custom_trading_post_name', { ascending: true });

  if (error) {
    console.error('Error fetching custom trading posts:', error);
    throw new Error(`Failed to fetch custom trading posts: ${error.message}`);
  }

  return data || [];
}
